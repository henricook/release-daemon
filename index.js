require('console-stamp')(console, 'HH:MM:ss.l');

const chalk = require("chalk");
const ciBuild = require("./ci-build");
const ciDev = require("./ci-dev");
const config = require("./config").getConfig();
const github = require("./github");
const q = require("q");

function testGithubAuthentication()
{
    return github.testAuthentication();
}

function testCiBuildAuthentication()
{
    return ciBuild.testAuthentication();
}

function testCiDevAuthentication()
{
    return ciDev.testAuthentication();
}

function getBuildStatusesForAllProjects()
{
    const projectsBuildsPromises = config.ciDevProjects.map(project => ciDev.getBuildStatuses(project));
    return q.all(projectsBuildsPromises);
}

function getLatestNotYetBuiltGitSHAs(projectName, buildStatuses)
{
    return github.getTags(projectName)
        .then(tags =>
        {
            const latestSHAs = [];

            for (let index = 0; index < buildStatuses.length; index++)
            {
                if (buildStatuses[index].result !== "SUCCESS")
                    continue;

                // Stop further searching if found a build which is tagged
                // Tagging older builds with newer tags would cause problems.
                const buildSHA = buildStatuses[index].description;
                if (tags.some(tag => tag.commit.sha.startsWith(buildSHA)))
                    break;

                // Don't add same SHA twice
                if (latestSHAs.indexOf(buildSHA) !== -1)
                    continue;

                latestSHAs.push(buildSHA);
            }

            return latestSHAs;
        });
}

function unleashTheReleasingPower()
{
    // Get build statuses for all projects handled by the tool.
    return getBuildStatusesForAllProjects()
        .then(projectsBuildStatuses =>
        {
            // Gathering commit numbers that don't have git tags on them.
            const promises = projectsBuildStatuses.map((buildStatuses, projectIndex) =>
            {
                const projectName = config.ciDevProjects[projectIndex];
                return getLatestNotYetBuiltGitSHAs(projectName, buildStatuses);
            });
            return q.all(promises);
        })
        .then(projectsNotYetBuildSHAs =>
        {
            // Getting currently running build and queued builds
            const promises = [projectsNotYetBuildSHAs, ciBuild.getCurrentBuildStatus(), ciBuild.getQueuedBuilds()];
            return q.all(promises);
        })
        .then(results =>
        {
            const projectsNotYetBuildSHAs = results[0];
            const currentBuildStatus = results[1];
            const buildQueue = results[2];

            const projectsGitCommits = config.ciDevProjects.map(project => []);

            projectsNotYetBuildSHAs.forEach((gitCommitsToBuild, projectIndex) =>
            {
                const projectName = config.ciDevProjects[projectIndex];

                // Check if the particular project is in progress or has queued build
                // Do not schedule builds from the same project as the 'create-an-internal-release' job sucks and can't handle concurrent builds
                const isInProgress = currentBuildStatus && currentBuildStatus.some(cb => cb.parameters.ARTIFACT_NAME == projectName);
                const isQueued = buildQueue.some(build =>  build.parameters.ARTIFACT_NAME === projectName);
                if (isInProgress || isQueued)
                    return;

                // Start ONLY one build and make sure that's the oldest possible build.
                if (gitCommitsToBuild.length)
                    projectsGitCommits[projectIndex].push(gitCommitsToBuild[gitCommitsToBuild.length - 1]);
            });

            return projectsGitCommits;
        })
        .then(projectsGitCommits =>
        {
            const projectsReversedGitCommits = projectsGitCommits.map(pgc => pgc.reverse());
            return ciBuild.scheduleBuilds(projectsReversedGitCommits);
        });
}

module.exports = function ()
{
    testGithubAuthentication()
        .then(testCiDevAuthentication)
        .then(testCiBuildAuthentication)
        .then(unleashTheReleasingPower)
        .catch(error =>
        {
            console.error(chalk.red("An error has occurred when running the tool: "), error);
            console.error(chalk.red("Terminated."));
        })
        .finally(() =>
        {
            console.log("Done.")
        });
};

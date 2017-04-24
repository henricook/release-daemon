const BuildStatus = require("./model/BuildStatus");
const chalk = require("chalk");
const config = require("./config").getConfig();
const Jenkins = require("./jenkins");
const q = require("q");
const request = require("request");

const ciOpenJenkinsClient = new Jenkins(config.ciOpenApiUrl, config.ciOpenUsername, config.ciOpenApiToken);

ciOpenJenkinsClient.getCurrentBuildStatus = function ()
{
    console.log(`[Open] Getting current build status on "${this.m_url}".`);

    const deferred = q.defer();

    if (this.m_currentBuildStatusCache)
    {
        deferred.resolve(this.m_currentBuildStatusCache)
    }
    else
    {
        const requestComplete = (error, response, data) =>
        {
            if (error || response.statusCode !== 200)
            {
                const message = "[Open] The request to get current build status has failed.";
                console.error(chalk.red(message));

                deferred.reject(message);
            }
            else
            {
                console.log(chalk.green("[Open] Success."));

                const buildsInProgress = JSON.parse(data).builds.filter(build => build.result === null);
                this.m_currentBuildStatusCache = buildsInProgress ? buildsInProgress.map(bip => new BuildStatus(bip)) : null;
                deferred.resolve(this.m_currentBuildStatusCache);
            }
        };

        this.authenticate(request.get(`${this.m_url}job/create-a-release/api/json?tree=builds[result,description,actions[parameters[name,value]]]`, requestComplete));
    }

    return deferred.promise;
};

ciOpenJenkinsClient.getQueuedBuilds = function ()
{
    console.log(`[Open] Getting builds queue on "${this.m_url}".`);

    const deferred = q.defer();

    if (this.m_buildQueue)
    {
        deferred.resolve(this.m_buildQueue)
    }
    else
    {
        const requestComplete = (error, response, data) =>
        {
            if (error || response.statusCode !== 200)
            {
                const message = "[Open] The request to get current build status has failed.";
                console.error(chalk.red(message));

                deferred.reject(message);
            }
            else
            {
                console.log(chalk.green("Success."));

                this.m_buildQueue = JSON.parse(data).items.map(build => new BuildStatus(build));
                deferred.resolve(this.m_buildQueue);
            }
        };

        const options =
        {
            url: `${this.m_url}queue/api/json`,
            headers:
            {
                "Content-Type": "application/json"
            }
        };

        this.authenticate(request.get(options, requestComplete));
    }

    return deferred.promise;
};

ciOpenJenkinsClient.startBuild = function (projectName, versionGitHash)
{
    console.log(`[Open] Starting the build for "${projectName}" with git version hash "${versionGitHash}".`);

    const requestOptions =
    {
        method: "POST",
        url: `${this.m_url}job/create-a-release/buildWithParameters`,
        headers:
        {
            "Content-Type": "application/json"
        },
        qs:
        {
            ARTIFACT_NAME: projectName,
            RELEASE_CANDIDATE_VERSION: versionGitHash
        }
    };

    function requestComplete(error, response)
    {
        if (error || response.status < 200 || response.status > 299)
        {
            const message = `[Open] Could not start build for "${projectName}" with git version hash "${versionGitHash}".`;
            console.error(chalk.red(message));
            deferred.reject(message);
        }
        else
        {
            console.log(chalk.green("[Open] Success."));
            deferred.resolve();
        }
    }

    console.log("[Open] Starting a create-a-release build with following parameters: ", requestOptions);

    const deferred = q.defer();
    // deferred.resolve();
    this.authenticate(request(requestOptions, requestComplete));
    return deferred.promise;
};

ciOpenJenkinsClient.scheduleBuilds = function (projectsGitCommits)
{
    let projectIndex = 0;
    let commitIndex = 0;

    const startNextBuild = () =>
    {
        // Check if done with starting builds. Finish if so.
        if (projectIndex >= projectsGitCommits.length)
            return null;

        const gitCommits = projectsGitCommits[projectIndex];

        // Check if done with a particular project. Move on to the next one
        if (commitIndex >= gitCommits.length)
        {
            projectIndex++;
            commitIndex = 0;
            return startNextBuild();
        }

        const projectName = config.projects[projectIndex];
        const commitSHA = gitCommits[commitIndex];

        commitIndex++;

        return this.startBuild(projectName, commitSHA).then(startNextBuild);
    };

    return startNextBuild();
};

module.exports = ciOpenJenkinsClient;
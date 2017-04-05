const BuildStatus = require("./model/BuildStatus");
const chalk = require("chalk");
const config = require("./config").getConfig();
const Jenkins = require("./jenkins");
const q = require("q");
const request = require("request");

const ciBuildJenkinsClient = new Jenkins(config.ciBuildApiUrl, config.ciBuildUsername, config.ciBuildApiToken);

ciBuildJenkinsClient.getCurrentBuildStatus = function ()
{
    getOpenCurrentBuildStatus();
    getInternalCurrentBuildStatus();
};

ciBuildJenkinsClient.getOpenCurrentBuildStatus = function ()
{

};

ciBuildJenkinsClient.getInternalCurrentBuildStatus = function ()
{
    console.log('Getting current build status on "${this.m_url}".');

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
                const message = "The request to get current build status has failed.";
                console.error(chalk.red(message));

                deferred.reject(message);
            }
            else
            {
                console.log(chalk.green("Success."));

                const buildsInProgress = JSON.parse(data).builds.filter(build => build.result === null);
                this.m_currentBuildStatusCache = buildsInProgress ? buildsInProgress.map(bip => new BuildStatus(bip)) : null;
                deferred.resolve(this.m_currentBuildStatusCache);
            }
        };

        this.authenticate(request.get(`${this.m_url}job/create-an-internal-release/api/json?tree=builds[result,description,actions[parameters[name,value]]]`, requestComplete));
    }

    return deferred.promise;
};

ciBuildJenkinsClient.getQueuedBuilds = function ()
{
    console.log(`Getting builds queue on "${this.m_url}".`);

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
                const message = "The request to get current build status has failed.";
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

ciBuildJenkinsClient.ciOpenStartBuild = function (projectName, gitCommit)
{
    console.log(`Creating an open release for the build "${projectName}" with commit sha "${gitCommit}".`);

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
                    RELEASE_CANDIDATE_VERSION: gitCommit,
                    RELEASE_TYPE: "MINOR"
                }
        };

    function requestComplete(error, response)
    {
        if (error || response.status < 200 || response.status > 299)
        {
            const message = `Could not start build for "${projectName}" with commit sha "${gitCommit}".`;
            console.error(chalk.red(message));
            deferred.reject(message);
        }
        else
        {
            console.log(chalk.green("Success."));
            deferred.resolve();
        }
    }

    console.log("Starting a build with following parameters: ", requestOptions);

    const deferred = q.defer();
    // deferred.resolve();
    this.authenticate(request(requestOptions, requestComplete));
    return deferred.promise;
};

ciBuildJenkinsClient.ciDevStartBuild = function (projectName, gitCommit)
{
    console.log(`Starting the build for internal "${projectName}" with commit sha "${gitCommit}".`);

    const requestOptions =
    {
        method: "POST",
        url: `${this.m_url}job/create-an-internal-release/buildWithParameters`,
        headers:
        {
            "Content-Type": "application/json"
        },
        qs:
        {
            ARTIFACT_NAME: projectName,
            GIT_COMMIT_ID: gitCommit
        }
    };

    function requestComplete(error, response)
    {
        if (error || response.status < 200 || response.status > 299)
        {
            const message = `Could not start build for "${projectName}" with commit sha "${gitCommit}".`;
            console.error(chalk.red(message));
            deferred.reject(message);
        }
        else
        {
            console.log(chalk.green("Success."));
            deferred.resolve();
        }
    }

    console.log("Starting a build with following parameters: ", requestOptions);

    const deferred = q.defer();
    // deferred.resolve();
    this.authenticate(request(requestOptions, requestComplete));
    return deferred.promise;
};

ciBuildJenkinsClient.scheduleBuilds = function (ciDevProjectsGitCommits, ciOpenProjectsGitCommits)
{
    let ciDevProjectIndex = 0;
    let ciOpenProjectIndex = 0;
    let commitIndex = 0;

    const startNextBuild = () =>
    {
      triggerBuildForCiDevProject();
      triggerBuildForCiOpenProject();
    };

    const triggerBuildForCiOpenProject = () =>
    {
        // Check if done with starting builds. Finish if so.
        if (ciOpenProjectIndex >= ciOpenProjectsGitCommits.length)
            return null;

        const gitCommits = ciOpenProjectsGitCommits[ciDevProjectIndex];

        // Check if done with a particular project. Move on to the next one
        if (commitIndex >= gitCommits.length)
        {
            ciOpenProjectIndex++;
            commitIndex = 0;
            return startNextBuild();
        }

        const projectName = config.ciOpenProjects[ciDevProjectIndex];
        const commitSHA = gitCommits[commitIndex];

        commitIndex++;

        return this.ciOpenStartBuild(projectName, commitSHA).then(triggerBuildForCiOpenProject);
    };

    const triggerBuildForCiDevProject = () =>
    {
        // Check if done with starting builds. Finish if so.
        if (ciDevProjectIndex >= ciDevProjectsGitCommits.length)
            return null;

        const gitCommits = ciDevProjectsGitCommits[ciDevProjectIndex];

        // Check if done with a particular project. Move on to the next one
        if (commitIndex >= gitCommits.length)
        {
            ciDevProjectIndex++;
            commitIndex = 0;
            return startNextBuild();
        }

        const projectName = config.ciDevProjects[ciDevProjectIndex];
        const commitSHA = gitCommits[commitIndex];

        commitIndex++;

        return this.ciDevStartBuild(projectName, commitSHA).then(triggerBuildForCiDevProject);
    };

    return startNextBuild();
};

module.exports = ciBuildJenkinsClient;

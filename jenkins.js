const BuildStatus = require("./model/BuildStatus");
const chalk = require("chalk");
const q = require("q");
const request = require("request");

function JenkinsClient(url, username, apiToken, style)
{
    this.m_url = url;
    this.m_username = username;
    this.m_apiToken = apiToken;
    this.m_style = style; // open or closed
    this.m_buildStatusesCache = {};
}

JenkinsClient.prototype =
{
    authenticate: function (request)
    {
        if (this.m_username && this.m_apiToken)
            return request.auth(this.m_username, this.m_apiToken);
        else
            return request;
    },

    getBuildStatuses: function (projectName)
    {
        console.log(`Getting build statuses on "${this.m_url}" for project "${projectName}".`);

        const deferred = q.defer();

        if (this.m_buildStatusesCache[projectName])
        {
            deferred.resolve(this.m_buildStatusesCache[projectName])
        }
        else
        {
            const requestComplete = (error, response, data) =>
            {
                if (error || response.statusCode !== 200)
                {
                    const message = "The request to get builds has failed.";
                    console.error(chalk.red(message));

                    deferred.reject(message);
                }
                else
                {
                    console.log(chalk.green("Success."));
                    this.m_buildStatusesCache[projectName] = JSON.parse(data).builds.map(build => new BuildStatus(build));
                    deferred.resolve(this.m_buildStatusesCache[projectName]);
                }
            };

            const options =
            {
                url: `${this.m_url}job/${projectName}/api/json?tree=builds[result,description,actions[parameters[name,value]]]`,
                headers:
                {
                    "Content-Type": "application/json"
                }
            };

            this.authenticate(request.get(options, requestComplete));
        }

        return deferred.promise;
    },

    testAuthentication: function ()
    {
        const requestComplete = (error, response) =>
        {
            if (error || response.statusCode !== 200)
            {
                const message = "Jenkins authentication was unsuccessful.";
                console.error(chalk.red(message));
                deferred.reject(message);
            }
            else
            {
                console.log(chalk.green("Success."));
                deferred.resolve();
            }
        };

        console.log(`Testing Jenkins authentication on "${this.m_url}".`);

        const deferred = q.defer();

        this.authenticate(request.get(`${this.m_url}api/json?tree=jobs[name]`, requestComplete));

        return deferred.promise;
    }
};

module.exports = JenkinsClient;

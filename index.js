const config = require('./config.json');
const IncomingWebhook = require('@slack/client').IncomingWebhook;
const SLACK_WEBHOOK_URL = config.SLACK_WEBHOOK_URL;

const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

// subscribe is the main function called by Cloud Functions.
module.exports.subscribe = (event, callback) => {
  const build = eventToBuild(event.data.data);
  console.log(build);
  // Skip if the current status is not in the status list.
  // Add additional statues to list if you'd like:
  // QUEUED, WORKING, SUCCESS, FAILURE,
  // INTERNAL_ERROR, TIMEOUT, CANCELLED
  const status = config.GCP_BUILD.STATUS_TO_REPORT;
  if (status.indexOf(build.status) === -1) {
    return callback();
  }

  if (!build.sourceProvenance || !build.sourceProvenance.resolvedRepoSource) {
    console.log('not reporting this build');
    return callback();
  }

  // Send message to Slack.
  const message = createSlackMessage(build);
  webhook.send(message, callback);
};

// eventToBuild transforms pubsub event message to a build object.
const eventToBuild = (data) => {
  return JSON.parse(new Buffer(data, 'base64').toString());
}

// createSlackMessage create a message from a build object.
const createSlackMessage = (build) => {
  let repoName = '';
  const repoLink = build.sourceProvenance.resolvedRepoSource.repoName.replace(/^(\w+)-(\w+)-(.*)$/, (m, a, b, c) => {
    repoName = c;
    return `https://${a}.com/${b}/${c}`;
  });

  let statusText = build.status;
  let iconEmoji = ':x:';
  let alertTag = '<!channel>';
  if (statusText === 'SUCCESS') {
    statusText = statusText.toLowerCase();
    iconEmoji = ':heavy_check_mark:';
    alertTag = '';
  }

  let message = {
    text: `${iconEmoji} Build ${statusText} - <${repoLink}|${repoName}> on ${build.source.repoSource.branchName}${alertTag}`,
    parse: 'full',
    mrkdwn: true,
    attachments: [{
      ts: Math.floor(Date.parse(build.finishTime).valueOf() / 1000),
      color: build.status === 'SUCCESS' ? 'good' : build.status === 'FAILURE' ? 'danger' : 'warning',
      fields: [{
          title: 'Branch',
          value: build.source.repoSource.branchName,
          short: true
        },
        {
          title: "Commit",
          value: `${build.sourceProvenance.resolvedRepoSource.commitSha.substr(0, 8)}`,
          short: true
        }
      ],
      actions: [{
          type: "button",
          text: "View Build",
          url: build.logUrl,
          style: build.status === 'SUCCESS' ? 'primary' : 'danger'
        },
        {
          type: "button",
          text: "View Commit",
          url: `${repoLink}/commits/${build.sourceProvenance.resolvedRepoSource.commitSha}`,
          style: build.status === 'SUCCESS' ? 'primary' : 'danger'
        }
      ]
    }]
  };
  return message;
}

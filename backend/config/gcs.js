const { Storage } = require('@google-cloud/storage');

let storage;

if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
    // Production: use individual env vars
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || 'spr-group-apps',
        credentials: {
            client_email: process.env.GCS_CLIENT_EMAIL,
            private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
        }
    });
} else if (process.env.GCS_CREDENTIALS) {
    // Alternative: full JSON credentials
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || 'spr-group-apps',
        credentials: JSON.parse(process.env.GCS_CREDENTIALS)
    });
} else {
    // Local dev: uses gcloud CLI auth
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || 'spr-group-apps'
    });
}

const bucketName = process.env.GCS_BUCKET_NAME || 'spr-group-apps-bucket';
const bucket = storage.bucket(bucketName);

module.exports = bucket;

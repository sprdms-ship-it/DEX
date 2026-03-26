const { Storage } = require('@google-cloud/storage');

let storage;

if (process.env.GCS_CREDENTIALS_BASE64) {
    const credentials = JSON.parse(
        Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8')
    );
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || credentials.project_id,
        credentials
    });
} else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        credentials: {
            client_email: process.env.GCS_CLIENT_EMAIL,
            private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
        }
    });
} else {
    // Fallback: gcloud CLI auth
    storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || 'spr-group-apps'
    });
}

const bucketName = process.env.GCS_BUCKET_NAME || 'spr-group-apps-bucket';
const bucket = storage.bucket(bucketName);

module.exports = bucket;
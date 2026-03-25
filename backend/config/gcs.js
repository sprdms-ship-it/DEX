const { Storage } = require('@google-cloud/storage');

// Create storage instance (uses your gcloud login automatically)
const storage = new Storage({
  projectId: 'spr-group-apps',
});

// Your bucket name from doc
const bucketName = 'spr-group-apps-bucket';

// Get bucket reference
const bucket = storage.bucket(bucketName);

module.exports = bucket;
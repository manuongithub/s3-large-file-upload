const express = require('express');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const s3 = new AWS.S3({
  region: 'us-east-2',
  accessKeyId: '',
  secretAccessKey: '',
});

app.post('/initiate-upload', async (req, res) => {
  const { bucket, key } = req.body;
  const params = {
    Bucket: bucket,
    Key: key,
    ContentType: 'video/mp4',
  };
  const data = await s3.createMultipartUpload(params).promise();
  res.json({ uploadId: data.UploadId });
});

app.post('/get-signed-url', async (req, res) => {
  const { bucket, key, partNumber, uploadId } = req.body;
  const params = {
    Bucket: bucket,
    Key: key,
    PartNumber: partNumber,
    UploadId: uploadId,
  };
  const signedUrl = await s3.getSignedUrlPromise('uploadPart', params);
  res.json({ signedUrl });
});

app.post('/complete-upload', async (req, res) => {
  const { bucket, key, uploadId, etags } = req.body;
  const params = {
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: etags,
    },
  };
  await s3.completeMultipartUpload(params).promise();
  res.sendStatus(200);
});

app.get('/list-mp4-files', async (req, res) => {
    const { bucket } = req.query;
    const params = {
      Bucket: bucket,
      Prefix: '',
    };
  
    const data = await s3.listObjectsV2(params).promise();
    const mp4Files = data.Contents.filter(item => item.Key.endsWith('.mp4')).map(item => ({
      key: item.Key,
      url: s3.getSignedUrl('getObject', { Bucket: bucket, Key: item.Key, Expires: 60 * 60 })
    }));
    res.json(mp4Files);
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'})
var s3 = new AWS.S3();
const es = require('elasticsearch')
const conn = require('http-aws-es');
//demo
const esClient = new es.Client({
    hosts: 'https://search-photos-uexmmyetzirhawpasqqp3bf6nu.us-east-1.es.amazonaws.com',
    connectionClass: conn,
    amazonES: {
        region: 'us-east-1',
        credentials: new AWS.Credentials('master', 'Master1$')
    }
});

exports.handler = async (event) => {
    var bucket = event.Records[0].s3.bucket.name;
    var file = event.Records[0].s3.object.key;
    const client = new AWS.Rekognition();
    console.log(event.Records[0].s3.object);
    var labels_arr = [];
    await s3.headObject({ Bucket:bucket, Key:file }, function (err, data) {
      if(err){
        console.log(err);
      }
      else{
        labels_arr.push(data.Metadata.customlabels);
        console.log(labels_arr);
      }
    }).promise();
    const params = {
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: file
        },
      },
      MaxLabels: 10
    };
    await client.detectLabels(params, function(err, response) {
      if (err) {
        console.log(err, err.stack); // if an error occurred
      } else {
          console.log(`Detected labels for: ${file}`)
          response.Labels.forEach(label => {
            console.log(`Label:      ${label.Name}`)
            console.log(`Confidence: ${label.Confidence}`)
            labels_arr.push(label.Name);
          }); // for response.labels
          
        }
    }).promise();
    console.log(labels_arr);
    var opensearch_entry = {"objectKey": file, "bucket": bucket, "createdTimestamp": Date.now(), "labels": labels_arr};
    var rand_id = Math.random() * 1000000000
    var create_output = await new Promise((resolve, reject) => {
      esClient.create({
          index: "photos",
          id: rand_id,
          body: opensearch_entry
      }, function(err, data) {
          if (err) {
              console.log("Error on creating data", err);
              reject(err)
          } else {
              console.log("data reply received", data);
              resolve(data)
          }
      })
    });
    console.log(create_output);
};

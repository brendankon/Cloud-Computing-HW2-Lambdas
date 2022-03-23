const aws = require('aws-sdk')
const lex = new aws.LexRuntime();
aws.config.update({region: 'us-east-1'})
const es = require('elasticsearch')
const conn = require('http-aws-es');
const { resolve } = require('url');
const sqs = new aws.SQS({apiVersion: '2012-11-05'});
const queueURL = "https://sqs.us-east-1.amazonaws.com/013058700034/Q1";
const docClient = new aws.DynamoDB.DocumentClient();
const ses = new aws.SES({ region: "us-east-1" });
var s3 = new aws.S3();
const esClient = new es.Client({
    hosts: 'https://search-photos-uexmmyetzirhawpasqqp3bf6nu.us-east-1.es.amazonaws.com',
    connectionClass: conn,
    amazonES: {
        region: 'us-east-1',
        credentials: new aws.Credentials('master', 'Master1$')
    }
});

var BotName = "CloudHWPhotosBot";
var BotAlias = 'PhotoSearch';

async function update_settings(){
    return new Promise((resolve, reject) => {
        const params = {
            index: 'photos',
            body: {
                  "settings": {
                    "analysis": {
                      "analyzer": {
                        "my_analyzer": {
                          "tokenizer": "my_tokenizer"
                        }
                      },
                      "tokenizer": {
                        "my_tokenizer": {
                          "type": "ngram",
                          "min_gram": 4,
                          "max_gram": 4,
                          "token_chars": [
                            "letter",
                            "digit"
                          ]
                        }
                      }
                    }
                  },
                  "mappings": {
                    "properties": {
                      "text":{
                        "type": "text",
                        "analyzer": "my_analyzer"
                      }
                    }
                  }
            }
        };
        esClient.indices.putSettings(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
}
async function analyze_keyword(keyword){
    return new Promise((resolve, reject) => {
        const params = {
            index: 'photos',
            body: {
                analyzer: "my_analyzer",
                text: keyword
            }
        };
        esClient.indices.analyze(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    });
}
async function search(keyword) {
    return new Promise((resolve, reject) => {
        const params = {
            index: 'photos',
            size: 1000,
            body: {
                query: {
                    wildcard: {
                        labels: "*" + keyword + "*"
                    }
                }
            }
        };
        esClient.search(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    });
}

async function delete_index() {
    return new Promise((resolve, reject) => {
        const params = {
            index: 'photos'
        };
        esClient.indices.delete(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    });
}

async function get_photos(hits){
    var photos = [];
    for(var i = 0; i < hits.length; i++){
      var f_name = hits[i]._source.objectKey;
      var bucket = hits[i]._source.bucket;
      var params = { Bucket: bucket, Key: f_name };
      var data = await s3.getObject(params).promise();
      console.log(i);
      if(data != null){
          console.log(data.Body);
        let image = new Buffer(data.Body).toString('base64');
        image = "data:"+data.ContentType+";base64,"+image;
        photos.push(image);
        console.log(photos.length);
      }

    }
    return [...new Set(photos)];;
}

exports.handler = async (event) => {
    //await esClient.indices.close({index: "photos"});
    //await update_settings();
    //await esClient.indices.open({index: "photos"});
    //return
    console.log(event);
    var params = {
        botName: BotName,
        botAlias: BotAlias,
        inputText: event.queryStringParameters.q,
        userId: "1234"
    };
    var keywords = [];

    var post_response = await lex.postText(params, function (err, data) {
        if(data != null){
            console.log(data);
            if (data.slots.keyword_one != null){
                console.log(data.slots.keyword_one);
                keywords.push(data.slots.keyword_one);
            }
            
            if (data.slots.keyword_two != null){
                keywords.push(data.slots.keyword_two);
            }
        }
        
    }).promise();
    
    const trigrams0_obj = await analyze_keyword(keywords[0]);
    console.log(trigrams0_obj)
    var trigrams0 = [];
    for (let i in trigrams0_obj.tokens){
        console.log(trigrams0_obj.tokens[i].token);
        trigrams0.push(trigrams0_obj.tokens[i].token);
    }
    
    console.log(trigrams0);
    var hits = [];
    for(let i in trigrams0){
        const hits_obj = await search(trigrams0[i]);
        const hits_arr = hits_obj.hits.hits;
        console.log(hits_arr);
        hits = hits.concat(hits_arr);
    }
    console.log(hits);
    // res1 = await search(keywords[0]);
    //const res2 = null;
    if (keywords.length > 1){
            const trigrams1_obj = await analyze_keyword(keywords[1]);
            var trigrams1 = [];
            for (let i in trigrams1_obj.tokens){
                trigrams1.push(trigrams1_obj.tokens[i].token);
            }
            for(let i in trigrams1){
                    const hits_obj = await search(trigrams1[i]);
                    const hits_arr = hits_obj.hits.hits;
                    hits = hits.concat(hits_arr);
            }
    }
    //console.log(res1);
    //console.log(res2);
    
    //var hits = null;
    //if (res2 != null){
      //  hits = res1.hits.hits.concat(res2.hits.hits);
    //}
    //else{
      //  hits = res1.hits.hits
    //}
    console.log(hits);
    var photos = await get_photos(hits);

    const response = {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Headers" : "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
        },
        body: JSON.stringify(photos),
    };

    return response;
};

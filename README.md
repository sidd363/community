# Dev setup

## First time setup
    # install redis & mongo

## With every pull
    npm install

## Server start
    node .
## To run the test cases and auto populate the DB with test data
    gulp  


## Developer Getting started

The Shrofile API server developed on top of loopback. Please refer http://loopback.io/getting-started/ to know about loopback.

You can find more loopback examples from https://github.com/strongloop/loopback-example
We choose https://github.com/strongloop/loopback-example-passport this our base.

### Install dependencies

All are required to install

**Node and NPM**

https://nodejs.org/en/download/

On Ubuntu

```
sudo apt-get update
sudo apt-get install node npm -y
sudo npm install -g loopback gulp
```

**Mongo**

https://www.mongodb.com/download-centers

On Ubuntu

```
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
sudo echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | sudo tee /etc/apt/sources.list.d/mongodb.list
sudo apt-get update
sudo apt-get install mongodb-10gen -y
sudo service mongod start
```

**Redis**

https://redis.io/download

On Ubuntu

https://www.digitalocean.com/community/tutorials/how-to-install-and-configure-redis-on-ubuntu-16-04

**elasticsearch**

https://www.elastic.co/downloads/elasticsearch

### Build and run

```
npm install
node .
```

Then goto http://0.0.0.0:3000/explorer/ this url for API documentation.

Status of api server http://0.0.0.0:3000/status

### Integration Test

* Start Mongo, Redis and ElasticSearch or using [docker-compose.yaml](https://bitbucket.org/!api/2.0/snippets/shrofile/L5g5o/master/files/docker-compose.yaml) this will bring up all dependencies as containers. This is for ease of use only, strictly not for production.
* Start notification service [follow this](https://bitbucket.org/shrofile/shrofile-notification/src/master/README.md) . Minimal requirement Java JRE should be installed.
* Then `gulp`

### Project Layout

**package.json**

NPM dependency management.

**server/middleware.json**

More Info : https://loopback.io/doc/en/lb2/middleware.json.html

**server/providers.json**

Has the social login configurations such as facebook, google and twitter.  For more information regarding the providers template, see http://loopback.io/doc/en/lb2/Configuring-providers.json.html.

**server/datasources.json**

you can configure the different datasources for your model here such as inmemory, mongo, mysql and etc.,

More Info: https://loopback.io/doc/en/lb2/datasources.json.html

**server/model-config.json**

It configures LoopBack models in the data sources and specifies whether a model is exposed over REST. 

More Info : https://loopback.io/doc/en/lb2/model-config.json.html

**server/server.js**

This is the main script.

More info : https://loopback.io/doc/en/lb2/server.js.html

#### Config files

**config/config.json**

All configurable settings of server.

More Info: https://loopback.io/doc/en/lb2/config.json.html

**config/essetting.json**

Elastic search default setting.

**config/esusermapping.json**

Elastic search user indices template.  While new indices created in ES which will take this as template.

**config/notificationConfig.json**

The notification messages template for different type of events in shrofile. 

**config/templateType.json**

Here answer templates are defined. Templates are defined in JSON schema. For example, Template will define what is the answer format for Video, Document, Form and Talent question types.

More about json-schema http://json-schema.org/examples.html


#### UI

**client**

This folder has html, css and javascript which loaded for http://0.0.0.0:3000/ . This is configured as loopback static in server/middleware.json

More Info: https://loopback.io/doc/en/lb2/client-directory.html

**common**

It has models which is shared by both server and client

More info : https://loopback.io/doc/en/lb2/common-directory.html

#### Test and Debug

**test**

This folder has all API integration test files which is writtern in `mocha`, `chai` and `supertest`. The tests are started using gulp tasks. Refer `gulpfile.js`

More info at https://strongloop.com/strongblog/how-to-test-an-api-with-node-js/

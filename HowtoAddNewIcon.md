# Follow these steps to add a new icon

1. Get the [AWS Simple Icons - EPS & SVG Formats](https://aws.amazon.com/architecture/icons/) and unzip it somewhere local.

2. Copy the correct service image into the img folder.  The example below is for RDS:
```shell
$> cp ~/aws/AWS_Simple_Icons_EPS-SVG_v17.1.19/Database/Database_AmazonRDS.png ~/code/ServerlessByDesign/www/img/aws/
```

3. In www/index.js update nodeTypes (index.js line 3) with a new entry. E.g.:
 ```json
rds: {
name: "RDS"
image: "./img/aws/YOUR_IMAGE_NAME.png"
}
```
4. Update nodeConnections (index.js line 54) with whatever are valid keys from nodeTypes and define the string for "action" for each type you want to support. 
 
5. Add the right image to www/img/aws/IMAGE.png. -- looks like 62x64 is the dimensions?

6. (**Optional**) Update getEdgeStyle to include a case for your action (up in nodeTypes) and define the edge (e.g. color, etc).


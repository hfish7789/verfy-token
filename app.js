const express = require('express')
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const shrinkRay = require('shrink-ray-current')
const fileUpload = require('express-fileupload');
var mysql = require('mysql');
const port = Number(process.env.HTTP_PORT || 80)
const portHttps = Number(process.env.HTTPS_PORT || 443)
var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "WbH7b24yH7atJJ6D",
    database: "verifylensdb"
  });
  con.connect(function (err) {
    if (err) throw err;
    console.log("Database Connected!");
  });
process.on("uncaughtException", (err) => console.log('exception',err));
process.on("unhandledRejection", (err) => console.log('rejection',err));

const execute = (sql, params) => {
  return new Promise(resolve=>{
    try {
      con.query(sql, params, function (error, result) {
        resolve({ error, result })
      })
    } catch (error) {
      resolve({ error })
    }
  })
}

(async ()=>{
    const app = express()
    const server = http.createServer(app)
    app.use(express.static(path.normalize(__dirname + '/public')));
    let httpsServer = null

    const file_key = __dirname+'/certs/verifylens.com.key';
    const file_crt = __dirname+'/certs/verifylens.com.cer';
    // const file_ca = __dirname+'/certs/ssl.ca-bundle';
    if (fs.existsSync(file_key) && fs.existsSync(file_crt) ) { // && fs.existsSync(file_ca)
        const key = fs.readFileSync(file_key, 'utf8')
        const cert = fs.readFileSync(file_crt, 'utf8')
        /* const caBundle = fs.readFileSync(file_ca, 'utf8')
        const ca = caBundle.split('-----END CERTIFICATE-----\n') .map((cert) => cert +'-----END CERTIFICATE-----\n')
        ca.pop() */
        const options = {cert,key} // ,ca
        httpsServer = https.createServer(options,app)
        // initSocket(httpsServer)
    } else {
        console.log("Do not find ssl files, disabled ssl features.")
    }
    app.use(shrinkRay())
    app.use(cors({
        origin: function(origin, callback){
            return callback(null, true)
        }
    }))
    app.use(fileUpload({
        limits: { fileSize: 50 * 1024 * 1024 },
      }));
      
    app.use(express.urlencoded())
    app.use(express.json())

    app.use(express.static(path.normalize(__dirname + '/build')))
    app.get('*', (req, res) => {
        if (req.protocol==='http') {
          return res.redirect('https://' + req.hostname + '/' + req.url)
        }
        res.sendFile(path.join(__dirname, "build", "index.html"));
    })
    app.post('/login', async (req, res) => {
        try{
          const result = await execute("SELECT * FROM user WHERE username = ?", [ req.body.email ])
          console.log(result.result)
          if (result.result && result.result.length > 0) {
            if (result.result[0].password == req.body.password) {
              res.json('success');
            } else {
              res.json('wrong_pass');
            }
          } else {
            res.json('no_exist');
          }
        }catch(error) {
          console.log(error)
          res.json('error');
        }
    })
    app.post('/change_password', async (req, res)=>{
      try{
        const result = await execute("SELECT * FROM user WHERE  username = ?", ['administrator@gmail.com'])
        if (result.result && result.result.length > 0) {
          if (result.result[0].password == req.body.old) {
              var sql = "UPDATE user SET password = '" + req.body.password + "' WHERE username = 'administrator@gmail.com'";
              con.query(sql, function (err, result) {
                  if (err) throw err;
                  res.json("success");
              });
          }
          else{
              res.json("wrong")
          }
      }
      }catch(error){
        console.log(error)
        res.json('error')
      }
    })
    app.post('/upload',async (req, res)=>{
      try{
        const files = req.files
        if (files)
        {
         const fileName = files.file.name;
         const fileHash = files.file.md5;
         const filePath = __dirname + "/public/" + files.file.md5+'.'+files.file.name.slice(-3);
         files.file.mv(filePath, async (err) => {
             if (err) {
                 console.log("Error: failed to download file.");
                 return res.status(500).send(err);
             }
             var sql = "INSERT INTO ads_list (name, hash_name, status,url) VALUES ('" + files.file.name + "', '" + files.file.md5+'.'+files.file.name.slice(-3) + "','Active','"+req.body.url+"')";
             con.query(sql, function (err, result) {
               if (err) throw err;
               res.send("success");
             });
         });
        }
      }catch(error){
        res.json('error')
      }
    })
        app.post('/get_list',function(req,res){
          con.query("SELECT * FROM ads_list WHERE status = 'Active' or status = 'DeActive'", function (err, result) {
              if (result && result.length > 0) {
                res.json(result)
              }
              else {
                res.json({});
              }
            })
      })
      app.post('/get_list_ads',function(req,res){
        try{
          con.query("SELECT * FROM ads_list WHERE status = 'Active' ORDER BY id DESC;", function (err, result) {
            if (result && result.length > 0) {
              res.json(result)
            }
            else {
              res.json({});
            }
          })
        }
        catch(error){
            res.json('error')
        }
      
    })
      app.post('/change_status',function(req,res){
        try{
          var sql = "UPDATE ads_list SET status = '" + req.body.status + "' WHERE id = '"+req.body.id+"'";
          con.query(sql, function (err, result) {
              if (err) throw err;
              res.json("success");
          });
        }catch(error){
          res.json('error')
        }
        
      })
    let time = +new Date()
    await new Promise(resolve=>server.listen({ port, host:'0.0.0.0' }, ()=>resolve(true)))
    console.log(`Started HTTP service on port ${port}. ${+new Date()-time}ms`)
    if (httpsServer) {
        await new Promise(resolve=>httpsServer.listen({ port:portHttps, host:'0.0.0.0' }, ()=>resolve(true)))
        console.log(`Started HTTPS service on port ${portHttps}. ${+new Date()-time}ms`)
    }
})()
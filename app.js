const mysql = require("mysql2");
const { Sequelize, Op, Model, DataTypes } = require("sequelize");
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require('bcryptjs');
const { v4: uuid4 } = require('uuid');
const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");
const SMTPServer = require("smtp-server").SMTPServer;
const simpleParser = require('mailparser').simpleParser;
const dns = require("dns");
const fs = require('fs');

const mysqlOption = require("./config/mysql.json");
const apiOption = require("./config/api.json");
const owner = require("./config/owner.json");
const smtpOption = require("./config/smtp.json");
const dkimOption = require("./config/dkim.json");

var sequelize = new Sequelize(mysqlOption.database, mysqlOption.user, mysqlOption.password, {
    host: mysqlOption.host,
    port: mysqlOption.port ? mysqlOption.port : 3306,
    dialect: "mysql",
    timezone: mysqlOption.timezone,
    pool: {
        max: 10,
        min: 0
    },
    logging: false
});

var api = express();
api.use(bodyParser.json({limit: apiOption.size}));

// 守卫中间件
api.use(async function(req, res, next){
    if(!req.body.user || !req.body.user.username || !req.body.user.domain || !req.body.user.password){
        res.status(400).send({msg: "BAD_REQUEST"});
    }else if(req.body.user.username==owner.username && req.body.user.domain==owner.domain && req.body.user.password==owner.password){
        req._group = 2; // 登录用户是全局管理员
        next();
    }else{
        let [result, meta] = await sequelize.query("SELECT password,admin FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
            replacements: [req.body.user.username, req.body.user.domain]
        });
        if(result.length >= 1){
            if(bcrypt.compareSync(req.body.user.password, result[0].password)){
                req._group = result[0].admin; // 登录用户是域管理员或普通用户
                next();
            }else{
                res.status(401).send({msg: "PASSWORD_WRONG"});
            }
        }else{
            res.status(401).send({msg: "USER_NOT_FOUND"});
        }
    }
});

// 域路由中间件
api.use("/domain", function(req, res, next){
    if(req._group == 2){ // 只允许全局管理员操作域
        next();
    }else{
        res.status(403).send({msg: "PERMISSION_DENIED"});
    }
});

// 域路由
api.route("/domain")
    .get(async function(req, res){
        let [result, meta] = await sequelize.query("SELECT * FROM domains");
        res.send({msg: "OK", load: result});
    })
    .post(async function(req, res){
        if(!req.body.load || !req.body.load.domain || (!req.body.load.alia_domain && req.body.load.alia_domain!="")){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let [result, meta] = await sequelize.query("SELECT did FROM domains WHERE domain=?", {
                replacements: [req.body.load.domain]
            });
            if(result.length >= 1){
                res.status(409).send({msg: "DOMAIN_EXIST"});
            }else{
                await sequelize.query("INSERT INTO domains(domain,alia_domain) VALUES(?,?)", {
                    replacements: [req.body.load.domain, req.body.load.alia_domain]
                });
                res.status(201).send({msg: "OK"});
            }
        }
    })
    .put(async function(req, res){
        if(!req.body.load || !req.body.load.did || !req.body.load.domain || (!req.body.load.alia_domain && req.body.load.alia_domain!="")){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let [result, meta] = await sequelize.query("SELECT did FROM domains WHERE domain=?", {
                replacements: [req.body.load.domain]
            });
            if(result.length >= 1){
                res.status(409).send({msg: "DOMAIN_EXIST"});
            }else{
                await sequelize.transaction(async function(t){
                    await sequelize.query("UPDATE domains SET alia_domain=? WHERE alia_domain=(SELECT domain FROM domains WHERE did=?)", {
                        replacements: [req.body.load.domain, req.body.load.did],
                        transaction: t
                    });
                    await sequelize.query("UPDATE domains SET domain=?,alia_domain=? WHERE did=?", {
                        replacements: [req.body.load.domain, req.body.load.alia_domain, req.body.load.did],
                        transaction: t
                    });
                });
                res.send({msg: "OK"});
            }
        }
    })
    .delete(async function(req, res){
        if(!req.body.load || !req.body.load.did){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            await sequelize.transaction(async function(t){
                await sequelize.query("DELETE FROM domains WHERE alia_domain=(SELECT domain FROM domains WHERE did=?)", {
                    replacements: [req.body.load.did],
                    transaction: t
                });
                await sequelize.query("DELETE FROM domains WHERE did=?", {
                    replacements: [req.body.load.did],
                    transaction: t
                });
            });
            res.status(204).send({msg: "OK"});
        }
    });
    
// 用户路由
api.route("/user")
    .post(async function(req, res){
        if(!req.body.load || !req.body.load.username || !req.body.load.password || !req.body.load.domain){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let permit = false;
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                let [result, meta] = [null, null];
                let did = null;
                [result, meta] = await sequelize.query("SELECT did FROM domains WHERE domain=?", {
                    replacements: [req.body.load.domain]
                });
                if(result.length == 0){
                    res.status(404).send({msg: "DOMAIN_NOT_FOUND"});
                }else{
                    did = result[0].did;
                    [result, meta] = await sequelize.query("SELECT uid FROM users WHERE username=? AND did=?", {
                        replacements: [req.body.load.username, did]
                    });
                    if(result.length >= 1){
                        res.status(409).send({msg: "USERNAME_EXIST"});
                    }else{
                        await sequelize.query("INSERT INTO users(username,password,did) VALUES(?,?,?)", {
                            replacements: [req.body.load.username, bcrypt.hashSync(req.body.load.password, bcrypt.genSaltSync(10)), did]
                        });
                        res.status(201).send({msg: "OK"});
                    }
                }
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    })
    .get(async function(req, res){
        let permit = false;
        if(!(!req.body.load || !req.body.load.domain)){
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                let [result, meta] = await sequelize.query("SELECT * FROM users WHERE did=(SELECT did FROM domains WHERE domain=?)", {
                    replacements: [req.body.load.domain]
                });
                res.send({msg: "OK", load: result});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }else{
            if(req._group == 2){
                permit = true;
            }
            if(permit){
                let [result, meta] = await sequelize.query("SELECT * FROM users");
                res.send({msg: "OK", load: result});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    })
    .patch(async function(req, res){
        let permit = false;
        if(!(!req.body.load || !req.body.load.username || !req.body.load.domain || !req.body.load.password)){
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain) || (req.body.load.username==req.body.user.username && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                await sequelize.query("UPDATE users SET password=? WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
                    replacements: [bcrypt.hashSync(req.body.load.password, bcrypt.genSaltSync(10)), req.body.load.username, req.body.load.domain]
                });
                res.send({msg: "OK"});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }else if(!(!req.body.load || !req.body.load.domain || !req.body.load.username || !req.body.load.admin)){
            if(req._group == 2){
                permit = true;
            }
            if(permit){
                await sequelize.query("UPDATE users SET admin=? WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
                    replacements: [req.body.load.admin?1:0, req.body.load.username, req.body.load.domain]
                });
                res.send({msg: "OK"});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }else{
            res.status(400).send({msg: "BAD_REQUEST"});
        }
    })
    .delete(async function(req, res){
        if(!req.body.load || !req.body.load.username || !req.body.load.domain){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let permit = false;
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                await sequelize.transaction(async function(t){
                    await sequelize.query("DELETE FROM users WHERE alia_username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
                        replacements: [req.body.load.username, req.body.load.domain],
                        transaction: t
                    });
                    await sequelize.query("DELETE FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
                        replacements: [req.body.load.username, req.body.load.domain],
                        transaction: t
                    });
                });
                res.status(204).send({msg: "OK"});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    });
    
// 别名用户路由
api.route("/user/alia")
    .post(async function(req, res){
        if(!req.body.load || !req.body.load.domain || !req.body.load.username || !req.body.load.alia_username){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let permit = false;
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                let [result, meta] = [null, null];
                let did = null;
                [result, meta] = await sequelize.query("SELECT did FROM domains WHERE domain=?", {
                    replacements: [req.body.load.domain]
                });
                if(result.length == 0){
                    res.status(404).send({msg: "DOMAIN_NOT_FOUND"});
                }else{
                    did = result[0].did;
                    [result, meta] = await sequelize.query("SELECT uid FROM users WHERE username=? AND did=?", {
                        replacements: [req.body.load.username, did]
                    });
                    if(result.length >= 1){
                        res.status(409).send({msg: "USERNAME_EXIST"});
                    }else{
                        await sequelize.query("INSERT INTO users(username,password,alia_username,did) VALUES(?,?,?,?)", {
                            replacements: [req.body.load.username, bcrypt.hashSync(uuid4(), bcrypt.genSaltSync(10)), req.body.load.alia_username, did]
                        });
                        res.status(201).send({msg: "OK"});
                    }
                }
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    })
    .get(async function(req, res){
        if(!req.body.load || !req.body.load.username || !req.body.load.domain){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let permit = false;
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain) || (req.body.load.username==req.body.user.username && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                let [result, meta] = await sequelize.query("SELECT * FROM users WHERE alia_username=? did=(SELECT did FROM domains WHERE domain=?)", {
                    replacements: [req.body.load.username, req.body.load.domain]
                });
                res.send({msg: "OK", load: result});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    });

// 信件路由
api.route("/mail")
    .post(async function(req, res){
        if(!req.body.load || !req.body.load.from || !req.body.load.to){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let [result, meta] = [null, null];
            let permit = false;
            if(req._group == 2){
                permit = true;
            }else{
                [result, meta] = await sequelize.query("SELECT domain FROM domains WHERE alia_domain=?", {
                    replacements: [req.body.user.domain]
                });
                let domains = [req.body.user.domain];
                for(i in result){
                    domains.push(result[i].domain);
                }
                let domainFlag = true;
                for(i in req.body.load.from){
                    if(!req.body.load.from[i].domain || !domains.includes(req.body.load.from[i].domain)){
                        domainFlag = false;
                        break;
                    }
                }
                if(req._group == 1){
                    permit = domainFlag;
                }else{
                    [result, meta] = await sequelize.query("SELECT username FROM users WHERE alia_username=?", {
                        replacements: [req.body.user.username]
                    });
                    let usernames = [req.body.user.username];
                    for(i in result){
                        usernames.push(result[i].username);
                    }
                    let usernameFlag = true;
                    for(i in req.body.load.from){
                        if(!req.body.load.from[i].username || !usernames.includes(req.body.load.from[i].username)){
                            usernameFlag = false;
                            break;
                        }
                    }
                    permit = domainFlag && usernameFlag;
                }
            }
            if(permit){
                let envelopes = {};
                for(i in req.body.load.to){
                    if(!envelopes[req.body.load.to[i].domain]){
                        envelopes[req.body.load.to[i].domain] = {
                            to: [],
                            cc: [],
                            bcc: []
                        };
                    }
                    envelopes[req.body.load.to[i].domain].to.push({
                        name: req.body.load.to[i].nickname,
                        address: req.body.load.to[i].username + '@' + req.body.load.to[i].domain
                    });
                }
                for(i in req.body.load.cc){
                    if(!envelopes[req.body.load.cc[i].domain]){
                        envelopes[req.body.load.cc[i].domain] = {
                            to: [],
                            cc: [],
                            bcc: []
                        };
                    }
                    envelopes[req.body.load.cc[i].domain].cc.push({
                        name: req.body.load.cc[i].nickname,
                        address: req.body.load.cc[i].username + '@' + req.body.load.cc[i].domain
                    });
                }
                for(i in req.body.load.bcc){
                    if(!envelopes[req.body.load.bcc[i].domain]){
                        envelopes[req.body.load.bcc[i].domain] = {
                            to: [],
                            cc: [],
                            bcc: []
                        };
                    }
                    envelopes[req.body.load.bcc[i].domain].bcc.push({
                        name: req.body.load.bcc[i].nickname,
                        address: req.body.load.bcc[i].username + '@' + req.body.load.bcc[i].domain
                    });
                }
                let from = [];
                for(i in req.body.load.from){
                    from.push({
                        name: req.body.load.from[i].nickname,
                        address: req.body.load.from[i].username + '@' + req.body.load.from[i].domain
                    });
                }
                for(domain in envelopes){
                    envelopes[domain].from = from;
                }
                let dkim = undefined;
                if(dkimOption[req.body.load.from[0].domain]){
                    dkim = {
                        domainName: req.body.load.from[0].domain,
                        keySelector: dkimOption[req.body.load.from[0].domain].keySelector,
                        privateKey: fs.readFileSync(dkimOption[req.body.load.from[0].domain].privateKeyPath)
                    };
                }
                let to = [];
                for(i in req.body.load.to){
                    to.push({
                        name: req.body.load.to[i].nickname,
                        address: req.body.load.to[i].username + '@' + req.body.load.to[i].domain
                    });
                }
                let cc = [];
                for(i in req.body.load.cc){
                    cc.push({
                        name: req.body.load.cc[i].nickname,
                        address: req.body.load.cc[i].username + '@' + req.body.load.cc[i].domain
                    });
                }
                let bcc = [];
                for(i in req.body.load.bcc){
                    bcc.push({
                        name: req.body.load.bcc[i].nickname,
                        address: req.body.load.bcc[i].username + '@' + req.body.load.bcc[i].domain
                    });
                }
                let attachments = [];
                for(i in req.body.load.attachments){
                    attachments.push({
                        filename: req.body.load.attachments[i].filename,
                        content: req.body.load.attachments[i].content,
                        encoding: "base64",
                        cid: req.body.load.attachments[i].cid
                    });
                }
                let mid = '<' + uuid4() + '@' + smtpOption.hostname + '>';
                let date = new Date();
                let msg = {};
                let load = {};
                for(domain in envelopes){
                    msg[domain] = "";
                    load[domain] = {};
                    let hosts = [];
                    try{
                        hosts = (await new Promise(function(resolve, reject){
                            dns.resolveMx(domain, function(err, addr){
                                if(err){
                                    reject(err);
                                }else{
                                    resolve(addr);
                                }
                            });
                        })).sort(function(a, b){
                            return a.priority - b.priority;
                        });
                    }catch(err){
                        msg[domain] = "MX_RESOLVE_FAILED";
                        continue;
                    }
                    for(i in hosts){
                        var transporter = nodemailer.createTransport({
                            port: 25,
                            host: hosts[i].exchange,
                            secure: false, //使用SSL建立连接
                            ignoreTLS: false, //关闭STARTTLS
                            requireTLS: false, //强制STARTTLS
                            tls: {
                                rejectUnauthorized: false
                            },
                            name: smtpOption.hostname, //本地主机名
                            connectionTimeout: 10*1000,
                            greetingTimeout: 10*1000,
                            dnsTimeout: 10*1000,
                            disableFileAccess: true,
                            disableUrlAccess: true,
                            dkim: dkim
                        });
                        try{
                            let info = await transporter.sendMail({
                                from: from,
                                to: to,
                                cc: cc,
                                bcc: bcc,
                                subject: req.body.load.subject,
                                text: req.body.load.text,
                                html: req.body.load.html,
                                attachments: attachments,
                                replyTo: req.body.load.replyTo,
                                inReplyTo: req.body.load.inReplyTo,
                                references: req.body.load.references,
                                envelope: envelopes[domain],
                                attachDataUrls: true,
                                priority: req.body.load.priority ? req.body.load.priority : "normal",
                                messageId: mid,
                                date: date
                            });
                            load[domain] = {
                                accepted: [],
                                rejected: []
                            };
                            for(i in info.accepted){
                                load[domain].accepted.push({
                                    username: info.accepted[i].split('@')[0],
                                    domain: info.accepted[i].split('@')[1]
                                });
                            }
                            for(i in info.rejected){
                                load[domain].rejected.push({
                                    username: info.rejected[i].split('@')[0],
                                    domain: info.rejected[i].split('@')[1]
                                });
                            }
                            msg[domain] = "OK";
                            break;
                        }catch(err){
                            if(err.code == "EDNS"){
                                msg[domain] = "DOMAIN_RESOLVE_FAILED";
                            }else if(err.code == "ETIMEDOUT"){
                                msg[domain] = "CONNECTION_TIMEOUT";
                            }else if(err.code == "ESOCKET"){
                                msg[domain] = "CONNECTION_REFUSED";
                            }else if(err.code=="EENVELOPE" || err.code=="EMESSAGE"){
                                msg[domain] = "RECIPIENT_NOT_FOUND";
                                break;
                            }else{
                                msg[domain] = "UNKNOWN_ERROR";
                            }
                        }
                    }
                }
                if(req.body.load.save){
                    let headers = {};
                    switch(req.body.load.priority){
                        case "high":
                            headers["X-Priority"] = "1 (Highest)";
                            headers["X-Msmail-Priority"] = "High";
                            headers["Importance"] = "High";
                            break;
                        case "low":
                            headers["X-Priority"] = "5 (Lowest)";
                            headers["X-Msmail-Priority"] = "Low";
                            headers["Importance"] = "Low";
                            break;
                    }
                    let mail = new MailComposer({
                        from: from,
                        to: to,
                        cc: cc,
                        bcc: cc,
                        subject: req.body.load.subject,
                        text: req.body.load.text,
                        html: req.body.load.html,
                        attachments: attachments,
                        replyTo: req.body.load.replyTo,
                        inReplyTo: req.body.load.inReplyTo,
                        references: req.body.load.references,
                        headers: headers,
                        messageId: mid,
                        date: date
                    });
                    let data = await new Promise(function(resolve, reject){
                        mail.compile().build(function(err, message){
                            if(err){
                                reject(err);
                            }else{
                                resolve(message.toString());
                            }
                        });
                    });
                    for(i in req.body.load.from){
                        let domain = req.body.load.from[i].domain;
                        let username = req.body.load.from[i].username;
                        [result, meta] = await sequelize.query("SELECT alia_domain FROM domains WHERE domain=?", {
                            replacements: [domain]
                        });
                        if(result.length>0 && result[0].alia_domain){
                            domain = result[0].alia_domain;
                        }
                        [result, meta] = await sequelize.query("SELECT alia_username FROM users WHERE username=?", {
                            replacements: [username]
                        });
                        if(result.length>0 && result[0].alia_username){
                            username = result[0].alia_username;
                        }
                        [result, meta] = await sequelize.query("SELECT uid FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
                            replacements: [username, domain]
                        });
                        if(result.length > 0){
                            let uid = result[0].uid;
                            await sequelize.query("INSERT INTO mails(mid,uid,content,category,created_time) VALUES(?,?,?,?,?)", {
                                replacements: [mid, uid, data, 1, date]
                            });
                        }
                    }
                }
                res.status(207).send({msg: msg, load: load});
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    })
    .get(async function(req, res){
        if(!req.body.load || !req.body.load.username || !req.body.load.domain){
            res.status(400).send({msg: "BAD_REQUEST"});
        }else{
            let permit = false;
            if(req._group == 2 || (req._group==1 && req.body.load.domain==req.body.user.domain) || (req.body.load.username==req.body.user.username && req.body.load.domain==req.body.user.domain)){
                permit = true;
            }
            if(permit){
                let [result, meta] = [null, null];
                if(!req.body.load.mid){
                    [result, meta] = await sequelize.query("SELECT mid,category,created_time FROM mails WHERE uid=(SELECT uid FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?))", {
                        replacements: [req.body.load.username, req.body.load.domain]
                    });
                    res.send({msg: "OK", load: result});
                }else{
                    [result, meta] = await sequelize.query("SELECT content FROM mails WHERE mid=? AND uid=(SELECT uid FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?))", {
                        replacements: [req.body.load.mid, req.body.load.username, req.body.load.domain]
                    });
                    res.send({msg: "OK", load: result});
                }
            }else{
                res.status(403).send({msg: "PERMISSION_DENIED"});
            }
        }
    });

api.listen(apiOption.port);

var mda = new SMTPServer({
    secure: false,
    // key: ,
    // cert: ,
    name: smtpOption.hostname,
    banner: "RBQ Mailer",
    size: smtpOption.size,
    disabledCommands: ["AUTH"],
    logger: false,
    async onRcptTo(address, session, callback) {
        let domain = address.address.split('@')[1];
        let username = address.address.split('@')[0];
        let [result, meta] = [null, null];
        [result, meta] = await sequelize.query("SELECT alia_domain FROM domains WHERE domain=?", {
            replacements: [domain]
        });
        if(result.length>0 && result[0].alia_domain){
            domain = result[0].alia_domain;
        }
        [result, meta] = await sequelize.query("SELECT alia_username FROM users WHERE username=?", {
            replacements: [username]
        });
        if(result.length>0 && result[0].alia_username){
            username = result[0].alia_username;
        }
        [result, meta] = await sequelize.query("SELECT uid FROM users WHERE username=? AND did=(SELECT did FROM domains WHERE domain=?)", {
            replacements: [username, domain]
        });
        if(result.length > 0){
            session._uid = result[0].uid;
            return callback();
        }else{
            return callback(new Error("User Not Found"));
        }
    },
    onData(stream, session, callback) {
        let data = "";
        stream.on("data", function(chunk){
            data += chunk.toString();
        })
        stream.on("end", async function(){
            let parsed = await simpleParser(data);
            let category = 0;
            if(session.clientHostname != session.hostNameAppearsAs){
                category = -1;
            }
            await sequelize.query("INSERT INTO mails(mid,uid,content,category,created_time) VALUES(?,?,?,?,?)", {
                replacements: [parsed.messageId, session._uid, data, category, parsed.date]
            });
            callback();
        });
    }
});

mda.listen(25);
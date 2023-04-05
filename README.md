# RBQ Mailer
RBQ Mailer是一个基于Node.js的电子邮件服务器，通过RESTful API提供了SMTP收发信功能。

## 安装

## 升级

暂无非兼容性更改。

## 配置

## 使用

### 请求和响应

本程序在启动后会创建一个HTTP服务器用于提供RESTful API，监听的端口是在`config/api.json`配置文件中设置的`port`端口，接口的所有请求和响应数据的传输都通过在请求体和响应体中附带JSON格式数据的方式进行。

请求体基本格式：

```json
{
    "user": {
        "username": "",
        "domain": "",
        "password": ""
    },
    "load": {}
}
```

所有接口请求都需要鉴权。请求体中JSON对象的`user`对象负责承载用户信息，`user.username`表示登录的用户名，`user.domain`表示登录的域名，`user.password`表示登录用户的密码；`load`对象承载了要操作的具体数据。

响应体基本格式：

```json
{
    "msg": "",
    "load": {}
}
```

响应体中JSON对象的`msg`对象表示响应的消息代码，`load`对象承载了查询的结果或数据库操作的情况。

响应状态码表：

| HTTP状态码 | 消息代码              | 含义               |
| ---------- | --------------------- | ------------------ |
| 200        | OK                    | 成功               |
| 201        | OK                    | 已创建             |
| 204        | OK                    | 已移除             |
| 207        |                       | 多状态             |
|            | DOMAIN_RESOLVE_FAILED | 域名解析失败       |
|            | MX_RESOLVE_FAILED     | 域名MX记录解析失败 |
|            | CONNECTION_TIMEOUT    | 连接超时           |
|            | CONNECTION_REFUSED    | 连接被拒绝         |
|            | RECIPIENT_NOT_FOUND   | 收件人全不存在     |
|            | UNKNOWN_ERROR         | 未知错误           |
|            | OK                    | 部分或全部已发送   |
| 400        | BAD_REQUEST           | 请求格式错误       |
| 401        | PASSWORD_WRONG        | 密码错误           |
| 401        | USER_NOT_FOUND        | 用户不存在         |
| 403        | PERMISSION_DENIED     | 权限不足           |
| 404        | DOMAIN_NOT_FOUND      | 域名不存在         |
| 409        | DOMAIN_EXIST          | 域名已存在         |
| 409        | USERNAME_EXIST        | 用户名已存在       |

### 用户组

#### 全局管理员

#### 域管理员

#### 普通用户

### 接口

#### 域

只允许全局管理员操作域，否则返回`PERMISSION_DENIED`。

##### 获取域列表

此操作会列出数据库中所有的域。

> GET /domain

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": []
}
```

##### 添加新域

此操作会在数据库中添加新的域，域名由`load.domain`指定，`load.alia_domain`置为空字符串；也可以添加已存在的域的别名，其中`load.domain`是要添加的别名，`load.alia_domain`是原域名。

> POST /domain

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    },
    "load": {
        "domain": "",
        "alia_domain": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 修改域

此操作会将指定`did`的域的域名和别名域名修改为新的域名`load.domain`和域名别名`load.alia_domain`，必须同时指定新的域名和域名别名，域名别名可以为空字符串。

> PUT /domain

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    },
    "load": {
        "did": 0,
        "domain": "",
        "alia_domain": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 删除域

此操作会将指定`did`的域删除。

> DELETE /domain

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    },
    "load": {
        "did": 0
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

#### 用户

##### 创建用户

此操作会在数据库中创建新用户，新用户为普通用户。用户名由`load.username`指定，域名由`load.domain`指定，密码由`load.password`指定。

只允许全局管理员或域管理员创建用户，否则返回`PERMISSION_DENIED`。

> POST /user

请求体格式：

```json
{
    "user": {
        "username": "admin",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "",
        "domain": "",
        "password": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 列出域下所有用户

此操作会列出指定域名`load.domain`下的所有用户。

只允许全局管理员或域管理员执行此操作，否则返回`PERMISSION_DENIED`。

> GET /user

请求体格式：

```json
{
    "user": {
        "username": "admin",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "domain": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": []
}
```

##### 列出所有用户

此操作会列出数据库中的所有用户。

只允许全局管理员执行此操作，否则返回`PERMISSION_DENIED`。

> GET /user

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": []
}
```

##### 修改密码

此操作会更改指定用户名`load.username`和指定域名`load.domain`的用户的密码`load.password`。

> PATCH /user

请求体格式：

```json
{
    "user": {
        "username": "user",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "user",
        "domain": "example.com",
        "password": "abcdef"
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 修改权限

此操作会更改指定用户名`load.username`和指定域名`load.domain`的用户的权限`load.admin`。

只允许全局管理员执行此操作，否则返回`PERMISSION_DENIED`。

> PATCH /user

请求体格式：

```json
{
    "user": {
        "username": "owner",
        "domain": "localhost",
        "password": "123456"
    },
    "load": {
        "username": "admin",
        "domain": "example.com",
        "admin": true
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 删除用户

此操作会在数据库中删除指定用户。用户名由`load.username`指定，域名由`load.domain`指定。本接口也能删除别名用户。

只允许全局管理员或域管理员删除用户，否则返回`PERMISSION_DENIED`。

> DELETE /user

请求体格式：

```json
{
    "user": {
        "username": "admin",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "user",
        "domain": "example.com"
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 添加别名用户

添加已存在的用户的别名，其中`load.username`是要添加的别名，`load.domain`是域名，`load.alia_username`是原用户名。

只允许全局管理员或域管理员执行此操作，否则返回`PERMISSION_DENIED`。

> POST /user/alia

请求体格式：

```json
{
    "user": {
        "username": "admin",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "",
        "domain": "",
        "alia_username": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK"
}
```

##### 列出指定用户的别名用户

列出指定用户的别名用户，其中`load.username`是用户名，`load.domain`是域名。

> GET /user/alia

请求体格式：

```json
{
    "user": {
        "username": "user",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "user",
        "domain": "example.com"
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": []
}
```

#### 信件

##### 发信

发出信件。`load.from`是发件地址数组，可以使用别名用户名和别名域名，`load.from[0].nickname`是发件人署名；`load.to`是收件地址数组，可填写多个收件地址；`load.cc`和`load.bcc`分别是抄送地址数组和密送地址数组；`load.subject`是邮件主题；`load.text`是发信的文本内容，`load.html`是发信的HTML内容，二者可选其一或同时存在；`load.attachments[0].filename`是附件的文件名，`load.attachments[0].content`是附件以Base64格式编码的内容，`load.attachments[0].cid`是若当前附件为邮件HTML内容的内嵌图片时的唯一Content ID；`load.replyTo`向收件人指定回复地址；`load.inReplyTo`表明当前邮件是回复给某邮件的，`load.references`是邮件会话中所有邮件的引用，都用邮件的Message ID标识；`load.priority`是当前邮件的优先级`high`、`normal`或`low`；`load.save`为`true`时，发件成功后会保存到数据库。

域管理员只能使用本域用户作为发件地址，普通用户只能填写属于自己的发件地址。全局管理员或域管理员以其他用户的名义发送的邮件将保存为相应用户的邮件，但如果相应用户不存在将不会保存邮件到不存在的用户。

> POST /mail

请求体格式：

```json
{
    "user": {
        "username": "alice",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "from": [
            {
                "nickname": "张三",
                "username": "alice",
                "domain": "example.com"
            }
        ],
        "to": [
            {
                "nickname": "李四",
                "username": "bob",
                "domain": "another.com"
            }
        ],
        "cc": [],
        "bcc": [],
        "subject": "",
        "text": "越过长城，走向世界。\nAcross the Great Wall we can reach every corner in the world.",
        "html": "<p>越过长城，走向世界。<br />Across the Great Wall we can reach every corner in the world.</p>",
        "attachments": [
            {
                "filename": "image.png",
            	"content": "",
                "cid": ""
            }
        ],
        "replyTo": "",
        "inReplyTo": "<message_id>",
        "references": [
            "<message_id>"
        ],
        "priority": "normal",
        "save": false
    }
}
```

响应体格式：

```json
{
    "msg": {
        "another.com": "OK"
    },
    "load": {
        "another.com": {
            "accepted": [
                {
                    "username": "bob",
                    "domain": "another.com"
            	}
            ],
            "rejected": []
        }
    }
}
```

##### 列出用户的所有信件

列出指定域`load.domain`指定用户`load.username`的所有信件。`load[0].category`代表信件的类别，`1`是发件箱、`0`是收件箱、`-1`是垃圾箱。

全局管理员可以列出任意用户的信件，域管理员可以列出本域用户的信件，普通用户只能列出自己的信件。

> GET /mail

请求体格式：

```json
{
    "user": {
        "username": "user",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "user",
        "domain": "example.com"
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": [
        {
            "mid": "",
            "category": 0,
            "created_time": ""
        }
    ]
}
```

##### 收信

收取指定用户指定邮件号`load.mid`的信件内容。

全局管理员可以收取任意用户的信件，域管理员可以收取本域用户的信件，普通用户只能收取自己的信件。

> GET /mail

请求体格式：

```json
{
    "user": {
        "username": "user",
        "domain": "example.com",
        "password": "123456"
    },
    "load": {
        "username": "user",
        "domain": "example.com",
        "mid": ""
    }
}
```

响应体格式：

```json
{
    "msg": "OK",
    "load": ""
}
```

## 开发

参见源代码注释。欢迎将本文档翻译为其它语言。

### 参见

### 历史

#### 0.1.0.20230406

感谢[小恸恸](https://github.com/xiaotong-tong)协助排查错误。

## 版权

不保留任何权利。

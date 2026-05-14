# GitHub登录
## after all
这个项目是一个去中心化的程序

程序刚安装的时候有新手引导，有跳过或继续两个选项，新增第三个选项，跳过并查看WebUI Token，相当于主界面->[H] 杂项->[E] 查看WebUI Token
## GitHub登录
程序刚安装的时候WebUI需要用Token登录才能使用管理员账户，引导用户前往设置页面用GitHub登录，获取用户信息（包括密码），然后保存到数据库中。询问用户是否将GitHub账户替换为管理员账户，若同意则进行替换，同时将WebUI Token 替换为GitHub账户的密码。用户下次打开程序时登录管理员账户时。
## 实现
采用 OAuth 2.0 的 PKCE 协议

需要你写好登录逻辑和回调地址等。

前端 @webui\frontend\src\components\auth\AuthPortal.tsx 添加“通过 GitHub 登录”按钮，**切记完善明暗主题的适配**，这里是后端主程序 @webui\backend\main.py

## 命令行
命令行下使用`mcsb login github.com`命令，打开默认浏览器，并引导用户进行GitHub登录，询问是否将GitHub账户替换为管理员账户，若同意则进行替换，同时将WebUI Token 替换为GitHub账户的密码。

> @bin\mcsb.c
> @bin\mcsb.cmd
> @bin\mcsb.ps1
> @bin\mcsb.sh

要求他们四个功能一样，并且编译`mcsb.c`，

# 注意
1. **每一阶段的改动都要提交**
2. 记得最后要完善开发者文档（给人看的） @docs/ 
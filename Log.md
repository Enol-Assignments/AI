# 0.0.0

已经把第一版骨架和主逻辑循环接起来了，现在这个小程序至少不是“空壳子”了，已经有一套能跑的迷宫对战原型。核心常量、数据结构约定和全局配置我放在了 `game_core/constants.js`，方便你们后面协作时统一接口【F:/D:/Enol/Workspace/WeChat/game_core/constants.js†L1-L88】。迷宫生成用了随机 DFS 加破墙与掩体投放【F:/D:/Enol/Workspace/WeChat/game_core/maze/generator.js†L35-L105】；寻路是按文档落的 A*【F:/D:/Enol/Workspace/WeChat/game_core/ai/pathfinding.js†L22-L78】；AI 决策这边先做了一个可扩展的行为树雏形，包含视线检测、低血量撤退和来弹闪避【F:/D:/Enol/Workspace/WeChat/game_core/ai/behaviorTree.js†L24-L150】。物理层已经能处理移动、射击、装弹、子弹命中和掩体破坏【F:/D:/Enol/Workspace/WeChat/game_core/engine/physics.js†L17-L161】；主循环则负责初始化、逐帧推进、狂暴收尾和胜负判定【F:/D:/Enol/Workspace/WeChat/game_core/engine/gameLoop.js†L35-L124】。

首页我也改成了一个能直接承接这套逻辑的原型页：`index.js` 里接好了 Canvas 初始化、16ms 定时循环、HUD 更新和触控输入【F:/D:/Enol/Workspace/WeChat/pages/index/index.js†L21-L216】，`index.wxml` 放了画布、状态栏和简易方向键/开火键【F:/D:/Enol/Workspace/WeChat/pages/index/index.wxml†L1-L75】，`index.wxss` 做了基础布局和样式【F:/D:/Enol/Workspace/WeChat/pages/index/index.wxss†L1-L114】。现在你在微信开发者工具里打开，应该就能看到一个“玩家 vs AI”的迷宫对战原型，先把主循环心脏跳起来了。

我这边做了静态检查和接口对齐，但当前环境里没有可用的 `node`，也没法直接替你在微信开发者工具里真机跑一遍，所以还没做运行态验证。下一步我建议我们优先补两件事：一是把玩家射击方向从“永远朝敌人”升级成摇杆/触点瞄准，二是把角色技能系统接进 `behaviorTree` 和 `physics`，这样就开始接近你 README 里那版真正的玩法了。


剩余：角色相关、物理引擎。
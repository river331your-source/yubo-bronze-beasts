# 豫博青铜神兽录

河南出土动物形制青铜器 · 线上数字交互展示网页

> 2026 河南省文化创意大赛 · 数字化方向

## 技术栈

- **Vite** — 构建工具
- **Three.js** — 3D 渲染
- **MediaPipe Hands** — 手势识别
- 纯 JavaScript，无 React

## 快速开始

### 1. 安装 Node.js

若尚未安装，请从 [nodejs.org](https://nodejs.org/) 下载 LTS 版本。

### 2. 安装依赖

```bash
cd D:\青铜器\yubo-bronze-beasts
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器打开 `http://localhost:5173`，允许摄像头权限以启用手势交互。

### 4. 放入模型

将 OBJ 文件放入 `public/models/`，详见 [public/models/README.md](https://public/models/README.md)。

## 三种交互模式

| 模式 | 手势 | 说明 |
|------|------|------|
| 解构与重构 | 握拳 / 张开 | 考古式分块分离与重组 |
| 纹样觉醒 | 👌 OK 手势 | 手电筒照射 → 纹样高亮 + 文化档案 |
| 材质还原 | 双手拉开 | 出土态 → 吉金态材质过渡 |

## 项目结构

```
yubo-bronze-beasts/
├── index.html              # 入口 HTML
├── public/models/          # OBJ 模型资源
├── src/
│   ├── main.js             # 应用入口
│   ├── style.css           # 国风暗调 UI
│   ├── data/               # 文物 & 纹样数据
│   ├── scene/              # Three.js 场景管理
│   ├── interactions/       # 三种交互逻辑
│   └── ui/                 # UI 控制器
└── package.json
```

## 开发排期

| 日期 | 任务 |
|------|------|
| 6/26 | ✅ 项目初始化 + UI 骨架 |
| 6/27 | 五模型切换 + 模型加载 |
| 6/28 | MediaPipe 手势调试 |
| 6/29 | 解构动画（Blender 分件） |
| 6/30 | 纹样标注 + 手电筒高亮 |
| 7/1 | 材质还原 + 文化文案 |
| 7/2 | 录视频 + 提交材料 |
| 7/3 | 截止提交 |

## 构建部署

```bash
npm run build
npm run preview
```

可部署至 Vercel / GitHub Pages。

## 许可证

本项目为 2026 河南省文化创意大赛参赛作品。

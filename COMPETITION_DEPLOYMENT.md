# COMPETITION_DEPLOYMENT（比赛部署版说明）

分支：`competition-deploy`（由 `master` 创建，用户未提交修改已原样带入）。

## 1. 正式部署流程

```bash
cd yubo-bronze-beasts
npm install        # 或 npm ci（不上传 node_modules）
npm run build      # 输出到 dist/
```

## 2. Vercel 配置

- Framework Preset：`Vite`
- Build Command：`npm run build`
- Output Directory：`dist`
- Install Command：`npm install`（或 `npm ci`）
- 将本仓库 `competition-deploy` 分支导入 Vercel，部署后得到 `https://*.vercel.app` 正式地址。
- 本项目以 Vercel 根域为目标，未为 GitHub Pages 做 base 路径改造。

## 3. HTTPS 要求

- 手机浏览器 `getUserMedia()` 要求 secure context：**只有 HTTPS 公网地址或 localhost 能开摄像头**。
- 局域网 `http://192.168.x.x:4173` 只能验证版式/横竖屏/触控/Three.js/FBX，**不能作为摄像头结论**；出现"摄像头不可用"属预期。
- 摄像头与 MediaPipe 真机验证一律使用 **Vercel Preview HTTPS 地址**。

## 4. 手机使用说明

- 手机横屏体验完整 16:9 交互界面（`100dvh`，安全区撑满）。
- 手机竖屏显示"请横屏体验"引导层，此时不初始化 Three.js / FBX / MediaPipe / 摄像头；转横屏后自动初始化一次，不重复。
- 单指拖动旋转文物，点击文物列表切换；捶拓页手指直接触摸操作。

## 5. 摄像头权限

- 首次进入展厅请求前置摄像头（`facingMode: user`，640×480 ideal）。
- 拒绝/无摄像头/被占用/模型失败时显示中文提示卡，可"重新开启摄像头"或"使用触控模式"。
- 若浏览器记住了"拒绝"，提示卡会追加指引：点地址栏摄像头图标改为允许后刷新。

## 6. 触控备用模式（手势优先、触控兜底）

| 状态 | 触控按钮 |
|---|---|
| PC + MediaPipe 正常 | 隐藏 |
| PC + 摄像头失败 | 显示 |
| 手机 + MediaPipe 正常 | 隐藏 |
| 手机 + 主动选触控模式 | 显示 |
| 手机 + 摄像头拒绝/失败 | 显示 |

按钮复用现有逻辑：聚形/解构/消散 → `pointCloud.setDeconstructState/setDissolveState`；
下一件 → `_onClapSwitchArtifact`（经复核为纯切换方法，无拍手冷却/debounce 依赖，保持现状不重构）。

## 7. 上线前测试清单

- [ ] `npm run build` 无 error；`dist/mediapipe/` 含 task + 6 个 wasm。
- [ ] PC：首页→展厅→切换→聚形→解构→消散→手势→纹样→捶拓全流程，控制台无红错。
- [ ] PC 拒绝摄像头：提示卡出现，触控条出现，重试/触控均可用。
- [ ] 手机竖屏：只见引导层；转横屏后正常初始化一次。
- [ ] 手机横屏 HTTPS：摄像头启动，触控条隐藏（手势正常时）。
- [ ] 手机 HTTPS 下拒绝摄像头：触控条出现，四按钮可用。
- [ ] 无境外运行时硬依赖：MediaPipe 本地；Google Fonts 非阻塞 + 系统字体 fallback。

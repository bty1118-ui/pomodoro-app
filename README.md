# 桌面番茄钟 · Desktop Pomodoro Timer

一个基于 Electron 的桌面番茄钟，采用现代极简风格，帮助你专注工作。

## 功能

- ⏱️ **专注 / 短休 / 长休** 循环（默认 25 / 5 / 15 分钟，可自定义）
- 🔄 **自动循环**：每完成 4 个番茄进入一次长休（间隔可调）
- ⏯️ **开始 / 暂停 / 重置**
- 🔔 阶段结束时 **提示音**（Web Audio 现场合成，无需音频文件）+ **桌面通知**
- ✅ **任务清单**：添加、完成、删除任务，并为「当前任务」累计完成的番茄数
- 💾 **自动持久化**：设置、任务、计时进度在关闭后保留
- 🎨 随阶段切换的柔和配色（番茄红 / 薄荷绿 / 海蓝）+ 大号环形进度

## 运行

需要已安装 [Node.js](https://nodejs.org/)（建议 18+）。

```bash
# 1. 安装依赖（首次）
npm install

# 2. 启动应用
npm start
```

## 使用说明

- 点击 **Start** 开始专注；计时结束会自动播放提示音并弹出通知。
- 默认每完成 4 个专注后进入 **长休**（圆点指示当前进度）。
- 在 **任务清单** 输入框输入文字、回车或点 **+** 添加任务；点击任务文字可设为「当前任务」，番茄完成时为它 +1。
- 在 **设置** 调整时长、长休间隔、是否自动开始下一阶段、是否开启提示音。

## 项目结构

```
pomodoro-app/
├── package.json      依赖与启动脚本
├── main.js           Electron 主进程（窗口 / 持久化 / 原生通知）
├── preload.js        安全的 contextBridge IPC 桥
├── src/
│   ├── index.html    界面结构
│   ├── styles.css    现代极简样式
│   └── renderer.js   计时状态机 + UI 逻辑
└── README.md
```

配置文件保存在系统用户数据目录下的 `pomodoro-config.json`（`%APPDATA%/pomodoro-app/`）。

## 技术说明

- 计时基于 `Date.now()` 时间戳算法，避免 `setInterval` 累积漂移。
- 渲染进程开启 `contextIsolation`、关闭 `nodeIntegration`，仅通过预加载脚本暴露最小 API。
- 提示音用 Web Audio API 合成，无需打包任何二进制音频资源。

## 打包（可选）

如需生成可分发的 `.exe`，可使用 [electron-builder](https://www.electron.build/)：

```bash
npm install --save-dev electron-builder
npx electron-builder --win
```

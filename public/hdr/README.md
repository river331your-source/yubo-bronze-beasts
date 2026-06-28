# HDRI 环境贴图

将棚拍/室内 HDRI 文件放到此目录：

```
public/hdr/studio.hdr
```

应用会优先加载该文件作为 PBR 环境反射（IBL）。

若文件不存在，会自动回退到 Three.js 内置的 `RoomEnvironment` 程序化环境。

推荐：2K 室内 studio HDRI，中性白棚光，适合青铜器产品展示。

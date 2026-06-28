# 3D 模型资源

五个 FBX 文件直接放在此目录，与 `src/data/artifacts.js` 中 `modelPath` 一一对应。

**更换模型后**：递增 `artifacts.js` 里的 `MODEL_ASSET_REVISION`，并运行 `node scripts/verify-all-fbx-parts.mjs` 核对分件名。

| 文件名 | 文物 | FBX 分件（Group/Mesh 名） |
|--------|------|---------------------------|
| `妇好鸮尊.fbx` | 妇好鸮尊 | `lid`, `body` |
| `青铜神兽.fbx` | 青铜神兽 | `head`, `body`, `feet`, `back` |
| `兽面纹铜方觥.fbx` | 兽面纹铜方觥 | `lid`, `body` |
| `蟠龙纹铜盉.fbx` | 蟠龙纹铜盉 | `spout`, `lid`, `body` |
| `匍雁铜盉.fbx` | 「匍」雁铜盉 | `lid`, `body` |

加载时会自动 Box3 缩放居中，并应用青铜 PBR 材质。

## 诊断脚本

```bash
node scripts/scan-all-fbx.mjs          # 打印层级与包围盒
node scripts/verify-all-fbx-parts.mjs  # 核对解构分件是否匹配
```

# -*- coding: utf-8 -*-
# 把 data/events/*.json 打包成一个文件 data/events-bundle.json（{eventId: 完整事件对象}）。
#
# 为什么要有这个文件：点赞汇总（js/kudos.js）和全站搜索（js/search.js）都需要读遍全部事件
# 文件才能算出正确结果——原来是各自发几十个小请求（一个事件一个文件），首页/第一次用搜索
# 都因此变慢。改成先读一次这一个打包文件，之后就是内存里的数据，不用再发请求。
#
# 什么时候要重新跑这个脚本：新增/修改/删除了 data/events/ 下面任何一个事件文件之后。
# 单个事件文件本身还是唯一的"真正数据源"（继续一个事件一个文件editing，方便单独改），
# 这个 bundle 文件是"衍生文件"，随时可以从事件文件重新生成，不是手工维护的。
#
# 运行方式：cd tools && python generate-events-bundle.py
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
EVENTS_DIR = os.path.join(ROOT, "data", "events")
OUT_PATH = os.path.join(ROOT, "data", "events-bundle.json")

bundle = {}
for fn in sorted(os.listdir(EVENTS_DIR)):
    if not fn.endswith(".json") or fn == "manifest.json":
        continue
    with open(os.path.join(EVENTS_DIR, fn), encoding="utf-8") as f:
        ev = json.load(f)
    bundle[ev["id"]] = ev

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(bundle, f, ensure_ascii=False, indent=1)
    f.write("\n")

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "_bundle_gen_result.txt"), "w", encoding="utf-8") as f:
    f.write("events bundled: " + str(len(bundle)) + "\n")
    f.write("output: " + OUT_PATH + "\n")

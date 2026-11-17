"""Figure 1: measured pipeline throughput of the shipped WASM kernel by context size.
Data source: docs/benchmarks/node-bench.json of omnidecide-wasm 1.0.0 (verified)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

labels = ["small\n(200 B ctx)", "medium\n(2 KB ctx)", "large\n(20 KB ctx)", "unicode\n(2 KB zh)"]
node = [13753, 4522, 552, 10914]
chromium = [13727, 4271, 528, 10076]

GRAPHITE = "#1A2330"
ACCENT = "#D4875A"

fig, ax = plt.subplots(figsize=(10.0, 5.5), dpi=200, constrained_layout=True)
x = range(len(labels))
w = 0.38
bars = ax.bar([i - w / 2 for i in x], node, w, color=GRAPHITE, label="Node.js v24 pipeline")
bars2 = ax.bar([i + w / 2 for i in x], chromium, w, color=ACCENT, label="Chromium 143 pipeline")
for b in bars:
    ax.annotate(f"{int(b.get_height()):,}", (b.get_x() + b.get_width() / 2, b.get_height()),
                ha="center", va="bottom", fontsize=9, color=GRAPHITE)
for b in bars2:
    ax.annotate(f"{int(b.get_height()):,}", (b.get_x() + b.get_width() / 2, b.get_height()),
                ha="center", va="bottom", fontsize=9, color="#B96F45")
ax.set_ylabel("decisions per second (pipeline)", fontsize=11)
ax.set_title("Shipped kernel: measured pipeline throughput by context size", fontsize=12, color=GRAPHITE, pad=10)
ax.set_xticks(list(x))
ax.set_xticklabels(labels, fontsize=10)
ax.set_ylim(0, 15500)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", alpha=0.25, linewidth=0.6)
ax.legend(loc="upper right", frameon=False, fontsize=10)
fig.savefig("/home/z/my-project/scripts/gamefoundry/throughput.png")
print("chart written")

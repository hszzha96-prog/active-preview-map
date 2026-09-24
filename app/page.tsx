"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BookMarked, BookOpen, BrainCircuit, Check, ChevronLeft, ChevronRight,
  Code2, Download, ExternalLink, Eye, FileText, Globe2, GraduationCap,
  Library, LockKeyhole, PencilLine, PlayCircle, Presentation, RotateCcw,
  Search, Share2, SlidersHorizontal, Sparkles, Upload, WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Marker = "考试必记" | "易混疑问" | "重点" | "基础了解";
type TemplateKey = "general" | "exam" | "data" | "coding" | "business" | "math";
type MetricKey = "core" | "exam" | "dependency" | "application" | "confusion";
type PageChunk = { page: number; text: string };
type ViewerMode = "source" | "learn";
type LearningLanguage = "zh" | "en";
type LearningResource = {
  name: string; description: string; category: "video" | "course" | "reading" | "practice";
  color: string; makeUrl: (query: string) => string;
};
type CourseNode = {
  id: string; page: number; section: string; title: string; summary: string;
  annotation: string; kind: string; source: string;
  scores: Record<MetricKey, number>; weight: number; marker: Marker;
  selected: boolean; manualMarker?: boolean;
};

const templateOptions: Record<TemplateKey, { name: string; hint: string; weights: Record<MetricKey, number> }> = {
  general: { name: "通用预习", hint: "概念、结构、步骤与结论", weights: { core: 30, exam: 25, dependency: 20, application: 15, confusion: 10 } },
  exam: { name: "考试冲刺", hint: "定义、比较、公式与易错点", weights: { core: 30, exam: 35, dependency: 15, application: 10, confusion: 10 } },
  data: { name: "数据分析", hint: "方法、前提、代码与结果解释", weights: { core: 25, exam: 20, dependency: 20, application: 25, confusion: 10 } },
  coding: { name: "编程实践", hint: "输入输出、依赖、代码与报错", weights: { core: 20, exam: 15, dependency: 25, application: 30, confusion: 10 } },
  business: { name: "商业案例", hint: "问题、数据、洞察与建议", weights: { core: 25, exam: 15, dependency: 15, application: 30, confusion: 15 } },
  math: { name: "数学公式", hint: "公式、变量、条件与例题", weights: { core: 30, exam: 30, dependency: 20, application: 10, confusion: 10 } },
};

const metricLabels: Record<MetricKey, string> = { core: "核心度", exam: "考试概率", dependency: "前后依赖", application: "应用价值", confusion: "易混程度" };
const markerStyle: Record<Marker, string> = { 考试必记: "marker-exam", 易混疑问: "marker-question", 重点: "marker-key", 基础了解: "marker-base" };
const clamp = (value: number, min = 1, max = 5) => Math.max(min, Math.min(max, value));
const encoded = (query: string) => encodeURIComponent(query);

const learningResources: LearningResource[] = [
  { name: "YouTube", description: "动画、直觉与完整讲解", category: "video", color: "red", makeUrl: (query) => `https://www.youtube.com/results?search_query=${encoded(query)}` },
  { name: "哔哩哔哩", description: "中文课程与实例拆解", category: "video", color: "pink", makeUrl: (query) => `https://search.bilibili.com/all?keyword=${encoded(query)}` },
  { name: "Coursera", description: "大学与企业结构化课程", category: "course", color: "blue", makeUrl: (query) => `https://www.coursera.org/search?query=${encoded(query)}` },
  { name: "edX", description: "高校公开课与课程章节", category: "course", color: "navy", makeUrl: (query) => `https://www.edx.org/search?q=${encoded(query)}` },
  { name: "MIT OpenCourseWare", description: "MIT 免费课程材料", category: "course", color: "orange", makeUrl: (query) => `https://ocw.mit.edu/search/?q=${encoded(query)}` },
  { name: "Google Scholar", description: "论文、教材与引用来源", category: "reading", color: "indigo", makeUrl: (query) => `https://scholar.google.com/scholar?q=${encoded(query)}` },
  { name: "Semantic Scholar", description: "学术论文与相关研究", category: "reading", color: "teal", makeUrl: (query) => `https://www.semanticscholar.org/search?q=${encoded(query)}&sort=relevance` },
  { name: "Wikipedia", description: "概念背景与术语脉络", category: "reading", color: "slate", makeUrl: (query) => `https://en.wikipedia.org/w/index.php?search=${encoded(query)}` },
  { name: "Kaggle", description: "数据集、Notebook 与案例", category: "practice", color: "cyan", makeUrl: (query) => `https://www.kaggle.com/search?q=${encoded(query)}` },
  { name: "GitHub", description: "代码实现与开源示例", category: "practice", color: "dark", makeUrl: (query) => `https://github.com/search?q=${encoded(query)}&type=repositories` },
];

const learningSections = [
  { key: "video" as const, title: "视频讲解", hint: "先建立直觉", icon: PlayCircle },
  { key: "course" as const, title: "公开课程", hint: "再系统学习", icon: GraduationCap },
  { key: "reading" as const, title: "权威阅读", hint: "核对定义与原理", icon: BookMarked },
  { key: "practice" as const, title: "动手练习", hint: "用案例真正掌握", icon: Code2 },
];

function computeWeight(scores: Record<MetricKey, number>, weights: Record<MetricKey, number>) {
  const keys = Object.keys(weights) as MetricKey[];
  const total = keys.reduce((sum, key) => sum + weights[key], 0) || 1;
  return Math.round((keys.reduce((sum, key) => sum + scores[key] * weights[key], 0) / (5 * total)) * 100);
}

function classifyMarker(node: Pick<CourseNode, "scores" | "weight">): Marker {
  if (node.scores.core >= 4 && node.scores.exam >= 4 && node.weight >= 70) return "考试必记";
  if (node.scores.confusion >= 4) return "易混疑问";
  if (node.weight >= 65) return "重点";
  return "基础了解";
}

function markerAnnotation(marker: Marker, summary: string, page: number, weight: number) {
  const lead: Record<Marker, string> = {
    考试必记: "需要能脱离课件准确复述，并解释为什么。",
    易混疑问: "请与相邻概念做对比，明确目标、条件和输出。",
    重点: "理解它在完整流程中的位置，并准备一个应用例子。",
    基础了解: "知道它解决什么问题以及出现在哪一页即可。",
  };
  return `${lead[marker]} ${summary}（P${page}，权重 ${weight}）`;
}

function inferKind(text: string) {
  const lower = text.toLowerCase();
  if (/vs\.?|compare|difference|区别|对比|比较/.test(lower)) return "概念比较";
  if (/step|process|workflow|流程|步骤|方法/.test(lower)) return "流程方法";
  if (/formula|equation|公式|定理|计算/.test(lower)) return "公式规则";
  if (/python|sql|code|代码|函数|模型/.test(lower)) return "代码实践";
  if (/case|example|案例|例子|应用/.test(lower)) return "案例应用";
  if (/define|definition|what is|定义|概念|含义/.test(lower)) return "核心概念";
  return "知识要点";
}

function inferScores(text: string, page: number, totalPages: number, kind: string): Record<MetricKey, number> {
  const lower = text.toLowerCase();
  const important = /important|key|must|核心|关键|重点|必须|原则/.test(lower);
  const examSignal = /define|difference|compare|formula|rule|定义|区别|比较|公式|规则|优缺点/.test(lower);
  const dependencySignal = /first|before|after|step|foundation|首先|前提|基础|步骤|流程/.test(lower);
  const appSignal = /case|example|apply|python|sql|practice|案例|例子|应用|代码|实践/.test(lower);
  const confusionSignal = /however|except|versus|difference|注意|但是|例外|区别|容易|不要/.test(lower);
  const early = page <= Math.max(3, Math.ceil(totalPages * 0.2));
  return {
    core: clamp(3 + Number(important) + Number(kind === "核心概念")),
    exam: clamp(2 + Number(examSignal) + Number(kind === "概念比较" || kind === "公式规则")),
    dependency: clamp(2 + Number(dependencySignal) + Number(early)),
    application: clamp(2 + Number(appSignal) + Number(kind === "案例应用" || kind === "代码实践")),
    confusion: clamp(2 + Number(confusionSignal) + Number(kind === "概念比较")),
  };
}

function cleanLines(text: string) {
  return text.replace(/\u00a0/g, " ").split(/\r?\n/).map((line) => line.replace(/^[-•●▪◦\s]+/, "").trim()).filter((line) => line.length > 1);
}

function analyzePages(pages: PageChunk[], weights: Record<MetricKey, number>) {
  const usable = pages.filter((page) => cleanLines(page.text).length);
  const groupSize = usable.length > 30 ? 6 : usable.length > 15 ? 5 : 4;
  const groupNames = new Map<number, string>();
  return usable.map((page, index) => {
    const lines = cleanLines(page.text);
    const title = (lines[0] || `第 ${page.page} 页知识点`).slice(0, 42);
    const bodyLines = lines.slice(1).filter((line) => line !== title);
    const summary = (bodyLines.slice(0, 3).join("；") || lines.slice(0, 2).join("；") || "本页需要人工补充摘要").slice(0, 180);
    const group = Math.floor(index / groupSize);
    if (!groupNames.has(group)) groupNames.set(group, `模块 ${group + 1} · ${title.slice(0, 16)}`);
    const source = lines.join(" · ").slice(0, 320);
    const kind = inferKind(`${title} ${summary}`);
    const scores = inferScores(`${title} ${summary}`, page.page, usable.length, kind);
    const weight = computeWeight(scores, weights);
    const marker = classifyMarker({ scores, weight });
    return {
      id: `N-${String(index + 1).padStart(3, "0")}`, page: page.page,
      section: groupNames.get(group)!, title, summary,
      annotation: markerAnnotation(marker, summary, page.page, weight),
      kind, source, scores, weight, marker, selected: weight >= 65,
    } satisfies CourseNode;
  });
}

async function parsePptx(file: File): Promise<PageChunk[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  const pages: PageChunk[] = [];
  for (let index = 0; index < slideFiles.length; index += 1) {
    const xml = await zip.files[slideFiles[index]].async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const text = Array.from(doc.getElementsByTagNameNS("*", "t")).map((node) => node.textContent?.trim()).filter(Boolean).join("\n");
    pages.push({ page: index + 1, text });
  }
  return pages;
}

async function parsePdf(file: File): Promise<PageChunk[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PageChunk[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({ page: pageNumber, text: content.items.map((item) => ("str" in item ? item.str : "")).join("\n") });
  }
  return pages;
}

async function parseFile(file: File): Promise<PageChunk[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pptx") return parsePptx(file);
  if (ext === "pdf") return parsePdf(file);
  if (ext === "txt" || ext === "md") {
    const chunks = (await file.text()).split(/\n\s*(?:---+|#{2,3}\s+)\s*/).filter((item) => item.trim());
    return chunks.map((chunk, index) => ({ page: index + 1, text: chunk }));
  }
  throw new Error("当前支持 PDF、PPTX、TXT 和 Markdown 文件。");
}

const sampleBase = [
  [1, "课程目标与学习路线", "理解特征工程、维度灾难和降维方法之间的关系。", "课程导入", "课程框架", [4, 3, 4, 3, 2]],
  [5, "Feature Engineering 定义", "利用领域知识把原始数据转成更有预测价值的输入。", "特征工程", "核心概念", [5, 5, 5, 4, 3]],
  [8, "Interaction Feature", "组合多个变量，捕捉单个字段无法表达的联合作用。", "特征工程", "流程方法", [4, 4, 4, 5, 4]],
  [12, "Scaling", "把不同单位的变量放到相近尺度，避免大数值字段支配模型。", "特征工程", "流程方法", [5, 5, 5, 5, 4]],
  [18, "维度灾难", "维度越高，数据越稀疏，距离与邻近关系逐渐失真。", "高维与降维", "核心概念", [5, 5, 5, 4, 5]],
  [20, "Selection vs Extraction", "选择保留原字段；提取生成新的低维综合特征。", "高维与降维", "概念比较", [5, 4, 5, 4, 5]],
  [23, "PCA 概览", "无监督寻找数据中最大方差方向，不使用类别标签。", "PCA 原理", "核心概念", [5, 5, 5, 5, 4]],
  [32, "Eigenvector", "特征向量决定主成分方向和原始变量的组合权重。", "PCA 原理", "公式规则", [5, 5, 5, 4, 5]],
  [33, "Eigenvalue", "特征值表示主成分能够解释的方差量。", "PCA 原理", "公式规则", [5, 5, 5, 4, 5]],
  [37, "Step 1 · Standardize", "PCA 对量纲敏感，拟合前通常需要先进行标准化。", "PCA 七步", "流程方法", [5, 5, 5, 5, 5]],
  [39, "Step 3 · Loadings", "用载荷解释哪些原始变量定义了某个主成分。", "PCA 七步", "流程方法", [5, 5, 5, 5, 5]],
  [45, "选择组件数量", "综合 Kaiser、累计解释方差和 Scree Plot，而不是只看一条规则。", "PCA 七步", "流程方法", [5, 5, 5, 5, 5]],
] as const;

function makeSample(weights: Record<MetricKey, number>): CourseNode[] {
  return sampleBase.map(([page, title, summary, section, kind, rawScores], index) => {
    const scores = { core: rawScores[0], exam: rawScores[1], dependency: rawScores[2], application: rawScores[3], confusion: rawScores[4] };
    const weight = computeWeight(scores, weights);
    const marker = classifyMarker({ scores, weight });
    return { id: `D3-${String(index + 1).padStart(2, "0")}`, page, section, title, summary, source: summary, kind, scores, weight, marker, selected: weight >= 65, annotation: markerAnnotation(marker, summary, page, weight) };
  });
}

function makeSamplePages(): PageChunk[] {
  return sampleBase.map(([page, title, summary, section, kind]) => ({
    page,
    text: `${title}\n${summary}\n所属模块：${section}\n知识类型：${kind}`,
  }));
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [template, setTemplate] = useState<TemplateKey>("data");
  const [weights, setWeights] = useState<Record<MetricKey, number>>(templateOptions.data.weights);
  const [nodes, setNodes] = useState<CourseNode[]>(() => makeSample(templateOptions.data.weights));
  const [activeId, setActiveId] = useState("D3-02");
  const [fileName, setFileName] = useState("Day 3 · Feature Engineering & PCA");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sourcePages, setSourcePages] = useState<PageChunk[]>(() => makeSamplePages());
  const [sourceType, setSourceType] = useState<"pdf" | "pptx" | "text" | "demo">("demo");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(5);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("source");
  const [learningLanguage, setLearningLanguage] = useState<LearningLanguage>("zh");
  const [learningQuery, setLearningQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeNode = nodes.find((node) => node.id === activeId) || nodes[0];
  const filteredNodes = useMemo(() => nodes.filter((node) => (!selectedOnly || node.selected) && (!query || `${node.title} ${node.summary} ${node.section}`.toLowerCase().includes(query.toLowerCase()))), [nodes, selectedOnly, query]);
  const sections = useMemo(() => Array.from(new Set(filteredNodes.map((node) => node.section))).map((section) => ({ name: section, nodes: filteredNodes.filter((node) => node.section === section) })), [filteredNodes]);
  const stats = useMemo(() => ({ pages: nodes.length ? Math.max(...nodes.map((node) => node.page)) : 0, nodes: nodes.length, selected: nodes.filter((node) => node.selected).length, average: nodes.length ? Math.round(nodes.reduce((sum, node) => sum + node.weight, 0) / nodes.length) : 0 }), [nodes]);
  const viewerPageIndex = Math.max(0, sourcePages.findIndex((page) => page.page === viewerPage));
  const viewerSource = sourcePages[viewerPageIndex] || { page: viewerPage, text: activeNode?.source || "当前页暂无可提取文字。" };
  const viewerNode = nodes.find((node) => node.page === viewerSource.page) || activeNode;
  const defaultLearningQuery = `${viewerNode?.title || cleanLines(viewerSource.text)[0] || "课程知识点"} ${viewerNode?.kind || ""}`.trim();
  const finalLearningQuery = `${learningQuery.trim() || defaultLearningQuery} ${learningLanguage === "zh" ? "中文 详细讲解 原理 例子" : "tutorial explained examples"}`;

  function recalculate(nextWeights: Record<MetricKey, number>) {
    setWeights(nextWeights);
    setNodes((current) => current.map((node) => {
      const weight = computeWeight(node.scores, nextWeights);
      const marker = node.manualMarker ? node.marker : classifyMarker({ scores: node.scores, weight });
      return { ...node, weight, marker, selected: weight >= 65, annotation: node.manualMarker ? node.annotation : markerAnnotation(marker, node.summary, node.page, weight) };
    }));
  }

  function applyTemplate(next: TemplateKey) { setTemplate(next); recalculate(templateOptions[next].weights); toast.success(`已切换为「${templateOptions[next].name}」模板`); }
  function replacePdfUrl(nextUrl: string | null) {
    setPdfUrl((current) => { if (current) URL.revokeObjectURL(current); return nextUrl; });
  }

  function loadDemo() {
    const demo = makeSample(weights);
    setNodes(demo); setActiveId(demo[0].id); setFileName("Day 3 · Feature Engineering & PCA");
    setPendingFile(null); setSourcePages(makeSamplePages()); setSourceType("demo"); replacePdfUrl(null);
    toast.success("已载入数据分析示例");
  }

  function openSourceAt(page: number) {
    const exact = sourcePages.find((item) => item.page === page);
    const fallback = sourcePages.reduce<PageChunk | null>((closest, item) => {
      if (!closest) return item;
      return Math.abs(item.page - page) < Math.abs(closest.page - page) ? item : closest;
    }, null);
    setViewerPage((exact || fallback)?.page || page);
    setViewerMode("source");
    setLearningQuery(activeNode ? `${activeNode.title} ${activeNode.kind}` : "");
    setViewerOpen(true);
  }

  function moveSourcePage(direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(sourcePages.length - 1, viewerPageIndex + direction));
    if (sourcePages[nextIndex]) {
      const nextPage = sourcePages[nextIndex].page;
      const nextNode = nodes.find((node) => node.page === nextPage);
      setViewerPage(nextPage);
      setLearningQuery(nextNode ? `${nextNode.title} ${nextNode.kind}` : cleanLines(sourcePages[nextIndex].text)[0] || "");
    }
  }

  function openLearningResource(resource: LearningResource) {
    window.open(resource.makeUrl(finalLearningQuery), "_blank", "noopener,noreferrer");
  }

  function openWebSearch() {
    window.open(`https://www.google.com/search?q=${encoded(finalLearningQuery)}`, "_blank", "noopener,noreferrer");
  }

  async function analyzeInput() {
    if (!pendingFile && !pastedText.trim()) { toast.error("请先上传课件或粘贴课件文字"); return; }
    setIsAnalyzing(true);
    try {
      let pages: PageChunk[];
      if (pendingFile) {
        if (pendingFile.size > 25 * 1024 * 1024) throw new Error("文件请控制在 25MB 以内。");
        pages = await parseFile(pendingFile);
      } else {
        pages = pastedText.split(/\n\s*(?:---+|#{2,3}\s+)\s*/).filter((item) => item.trim()).map((text, index) => ({ page: index + 1, text }));
      }
      const result = analyzePages(pages, weights);
      if (!result.length) throw new Error("没有提取到可用文字。扫描版 PDF 暂时需要先进行 OCR。");
      const extension = pendingFile?.name.split(".").pop()?.toLowerCase();
      setSourcePages(pages);
      setSourceType(extension === "pdf" ? "pdf" : extension === "pptx" ? "pptx" : "text");
      replacePdfUrl(pendingFile && extension === "pdf" ? URL.createObjectURL(pendingFile) : null);
      setNodes(result); setActiveId(result[0].id); setViewerPage(result[0].page); setFileName(pendingFile?.name.replace(/\.[^.]+$/, "") || "粘贴的课程材料");
      toast.success(`分析完成：生成 ${result.length} 个知识节点`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "分析失败，请更换文件后重试"); }
    finally { setIsAnalyzing(false); }
  }

  function patchActive(patch: Partial<CourseNode>) { if (activeNode) setNodes((current) => current.map((node) => node.id === activeNode.id ? { ...node, ...patch } : node)); }
  function exportJson() { downloadText(`${fileName}-主动预习地图.json`, JSON.stringify({ fileName, template, weights, nodes }, null, 2), "application/json;charset=utf-8"); toast.success("JSON 已导出"); }
  function exportCsv() {
    const rows = [["ID", "页码", "模块", "主题", "摘要", "权重", "标记", "批注"], ...nodes.map((node) => [node.id, node.page, node.section, node.title, node.summary, node.weight, node.marker, node.annotation])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadText(`${fileName}-节点表.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8"); toast.success("CSV 已导出");
  }
  async function shareSite() { try { await navigator.clipboard.writeText(window.location.href); toast.success("链接已复制；发布为可分享权限后朋友即可打开"); } catch { toast.info("请复制浏览器地址栏中的链接"); } }

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({ name: "load_preview_map_demo", title: "载入预习地图示例", description: "在主动预习地图中载入内置的数据分析课程示例。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { loadDemo(); return { status: "loaded", nodes: 12 }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
    // The document-level tool is registered once and cleaned up when the page unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="app-shell">
      <Toaster position="top-center" richColors />
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><BrainCircuit size={22} /></div><div><div className="brand-name">主动预习地图</div><div className="brand-caption">ACTIVE PREVIEW MAP</div></div><Badge variant="outline" className="ml-2 border-blue-200 bg-blue-50 text-blue-700">MVP · 本地解析</Badge></div>
        <div className="top-actions"><Button variant="outline" size="sm" onClick={shareSite}><Share2 />分享</Button><Button variant="outline" size="sm" onClick={() => window.print()}><FileText />导出 PDF</Button><Button size="sm" className="primary-action" onClick={exportJson}><Download />导出结果</Button></div>
      </header>

      <section className="workspace-grid">
        <aside className="control-panel">
          <div className="panel-heading"><div><span className="step-chip">01</span><h2>导入课件</h2></div><Button variant="ghost" size="sm" onClick={loadDemo}><RotateCcw />示例</Button></div>
          <Tabs defaultValue="file" className="source-tabs">
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="file"><Upload />上传文件</TabsTrigger><TabsTrigger value="text"><PencilLine />粘贴文字</TabsTrigger></TabsList>
            <TabsContent value="file">
              <button className={`drop-zone ${pendingFile ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} className="hidden" type="file" accept=".pdf,.pptx,.txt,.md" onChange={(event) => setPendingFile(event.target.files?.[0] || null)} />
                {pendingFile ? <Check size={24} /> : <Upload size={24} />}<strong>{pendingFile ? pendingFile.name : "选择 PDF 或 PPTX"}</strong><span>{pendingFile ? `${(pendingFile.size / 1024 / 1024).toFixed(1)} MB · 已准备分析` : "也支持 TXT / Markdown，最大 25MB"}</span>
              </button>
            </TabsContent>
            <TabsContent value="text"><Textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="粘贴课件文字；用 --- 分隔页面或章节……" className="min-h-32 resize-none bg-white" /></TabsContent>
          </Tabs>
          <div className="privacy-note"><LockKeyhole size={15} />文件只在当前浏览器解析，不会自动保存。</div>

          <div className="panel-divider" /><div className="panel-heading compact"><div><span className="step-chip">02</span><h2>预习模板</h2></div></div>
          <Select value={template} onValueChange={(value) => applyTemplate(value as TemplateKey)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(templateOptions) as TemplateKey[]).map((key) => <SelectItem key={key} value={key}>{templateOptions[key].name}</SelectItem>)}</SelectContent></Select>
          <p className="template-hint">{templateOptions[template].hint}</p>

          <div className="panel-divider" /><div className="panel-heading compact"><div><span className="step-chip">03</span><h2>权重配置</h2></div><SlidersHorizontal size={17} /></div>
          <div className="weight-list">{(Object.keys(metricLabels) as MetricKey[]).map((key) => <label className="weight-row" key={key}><span><b>{metricLabels[key]}</b><em>{weights[key]}%</em></span><Slider min={5} max={40} step={5} value={[weights[key]]} onValueChange={(value) => recalculate({ ...weights, [key]: value[0] })} /></label>)}</div>
          <Button className="analyze-button" onClick={analyzeInput} disabled={isAnalyzing}>{isAnalyzing ? <><Sparkles className="animate-pulse" />正在构建知识地图…</> : <><WandSparkles />开始主动预习</>}</Button>
        </aside>

        <section className="map-panel">
          <div className="map-toolbar"><div><p className="eyebrow">当前课件</p><h1>{fileName}</h1></div><div className="toolbar-tools"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" /></label><label className="toggle-label"><Switch checked={selectedOnly} onCheckedChange={setSelectedOnly} />只看重点</label></div></div>
          <div className="stats-strip"><div><span>页码范围</span><b>P1–{stats.pages}</b></div><div><span>知识节点</span><b>{stats.nodes}</b></div><div><span>高权重</span><b>{stats.selected}</b></div><div><span>平均权重</span><b>{stats.average}</b></div></div>
          <div className="legend-row"><span><i className="legend-dot exam" />考试必记</span><span><i className="legend-dot question" />易混疑问</span><span><i className="legend-dot key" />重点</span><span><i className="legend-dot base" />基础了解</span></div>
          <div className="mindmap-canvas" aria-label="知识思维导图">
            <div className="root-node"><BrainCircuit size={18} /><span>{fileName}</span></div><div className="trunk-line" />
            <div className="section-columns">{sections.length ? sections.map((section, sectionIndex) => <div className="section-column" key={section.name}><div className={`section-node section-${sectionIndex % 4}`}><span>{String(sectionIndex + 1).padStart(2, "0")}</span><b>{section.name}</b></div><div className="node-rail">{section.nodes.map((node) => <button key={node.id} className={`knowledge-node ${markerStyle[node.marker]} ${activeNode?.id === node.id ? "active" : ""}`} onClick={() => setActiveId(node.id)}><div className="node-meta"><span>{node.id} · P{node.page}</span><strong>{node.weight}</strong></div><b>{node.title}</b><small>{node.kind} · {node.marker}</small></button>)}</div></div>) : <div className="empty-map"><BookOpen size={30} /><b>没有匹配的节点</b><span>清除搜索条件或重新分析课件。</span></div>}</div>
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading"><div><span className="step-chip">04</span><h2>节点批注</h2></div><Badge variant="outline">可编辑</Badge></div>
          {activeNode ? <div className="inspector-content">
            <div className="active-node-header"><div><span>{activeNode.id} · P{activeNode.page}</span><h3>{activeNode.title}</h3></div><div className={`score-ring ${markerStyle[activeNode.marker]}`}>{activeNode.weight}</div></div>
            <Button className="source-jump-button" onClick={() => openSourceAt(activeNode.page)}><Eye />查看原课件 · P{activeNode.page}<ChevronRight /></Button>
            <label className="field-label">节点标题<Input value={activeNode.title} onChange={(event) => patchActive({ title: event.target.value })} /></label>
            <label className="field-label">所属模块<Input value={activeNode.section} onChange={(event) => patchActive({ section: event.target.value })} /></label>
            <label className="field-label">知识摘要<Textarea className="min-h-24" value={activeNode.summary} onChange={(event) => patchActive({ summary: event.target.value })} /></label>
            <label className="field-label">标记类型<Select value={activeNode.marker} onValueChange={(value) => patchActive({ marker: value as Marker, manualMarker: true })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["考试必记", "易混疑问", "重点", "基础了解"] as Marker[]).map((marker) => <SelectItem key={marker} value={marker}>{marker}</SelectItem>)}</SelectContent></Select></label>
            <label className="field-label">学习批注<Textarea className="min-h-36" value={activeNode.annotation} onChange={(event) => patchActive({ annotation: event.target.value })} /></label>
            <div className="score-breakdown"><p>五维评分</p>{(Object.keys(metricLabels) as MetricKey[]).map((key) => <div key={key}><span>{metricLabels[key]}</span><div><i style={{ width: `${activeNode.scores[key] * 20}%` }} /></div><b>{activeNode.scores[key]}</b></div>)}</div>
            <div className="source-card"><span>课件依据</span><p>{activeNode.source}</p></div>
            <div className="inspector-actions"><Button variant="outline" onClick={exportCsv}><Download />节点表</Button><Button onClick={() => window.print()}><FileText />生成 PDF</Button></div>
          </div> : <div className="empty-inspector">选择一个节点开始批注。</div>}
        </aside>
      </section>
      <footer className="statusbar"><span><i />分析结果已同步</span><span>当前模板：{templateOptions[template].name}</span><span>阈值：65 · 权重合计 {Object.values(weights).reduce((sum, value) => sum + value, 0)}%</span></footer>

      <Sheet open={viewerOpen} onOpenChange={setViewerOpen}>
        <SheetContent className="source-viewer-sheet" side="right">
          <SheetHeader className="source-viewer-header">
            <div className="source-viewer-title-row">
              <div className={`source-viewer-icon ${viewerMode === "learn" ? "learning" : ""}`}>{viewerMode === "learn" ? <GraduationCap size={20} /> : <Presentation size={20} />}</div>
              <div><SheetTitle>{viewerMode === "learn" ? "深入学习本页" : "原课件定位"}</SheetTitle><SheetDescription>{viewerMode === "learn" ? `${viewerNode?.title || "当前知识点"} · P${viewerSource.page}` : fileName}</SheetDescription></div>
            </div>
            <div className="viewer-mode-toggle" aria-label="课件与延伸学习切换">
              <Button variant={viewerMode === "source" ? "default" : "ghost"} size="sm" onClick={() => setViewerMode("source")}><Presentation />原课件</Button>
              <Button variant={viewerMode === "learn" ? "default" : "ghost"} size="sm" onClick={() => setViewerMode("learn")}><GraduationCap />延伸学习</Button>
            </div>
            {viewerMode === "source" ? <div className="source-page-nav">
              <Button variant="outline" size="sm" onClick={() => moveSourcePage(-1)} disabled={viewerPageIndex <= 0}><ChevronLeft />上一页</Button>
              <Badge className="source-page-badge">P{viewerSource.page}</Badge>
              <Button variant="outline" size="sm" onClick={() => moveSourcePage(1)} disabled={viewerPageIndex >= sourcePages.length - 1}>下一页<ChevronRight /></Button>
            </div> : null}
          </SheetHeader>

          <div className="source-viewer-body">
            {viewerMode === "learn" ? (
              <div className="learning-hub">
                <section className="learning-hero">
                  <div className="learning-kicker"><Badge>P{viewerSource.page}</Badge><span>{viewerNode?.kind || "知识要点"}</span></div>
                  <h3>{viewerNode?.title || cleanLines(viewerSource.text)[0] || "当前知识点"}</h3>
                  <p>{viewerNode?.summary || cleanLines(viewerSource.text).slice(1, 3).join("；") || "围绕当前页面继续查找讲解、课程、权威资料与练习。"}</p>
                  <Button className="web-search-button" onClick={openWebSearch}><Globe2 />全网搜索详细讲解<ExternalLink /></Button>
                </section>

                <section className="learning-search-panel">
                  <div className="learning-search-heading"><div><Search size={17} /><b>自动检索词</b></div><span>可按需要修改</span></div>
                  <div className="learning-search-controls">
                    <Input value={learningQuery} onChange={(event) => setLearningQuery(event.target.value)} placeholder={defaultLearningQuery} aria-label="延伸学习检索词" />
                    <Select value={learningLanguage} onValueChange={(value) => setLearningLanguage(value as LearningLanguage)}>
                      <SelectTrigger className="learning-language"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="zh">中文优先</SelectItem><SelectItem value="en">英文优先</SelectItem></SelectContent>
                    </Select>
                  </div>
                </section>

                <div className="learning-path" aria-label="建议学习顺序">
                  {[
                    ["01", "概念", "它是什么"], ["02", "原理", "为什么有效"], ["03", "案例", "何时使用"], ["04", "练习", "自己做一次"],
                  ].map(([step, title, detail]) => <div key={step}><span>{step}</span><b>{title}</b><small>{detail}</small></div>)}
                </div>

                {learningSections.map(({ key, title, hint, icon: Icon }) => <section className="learning-resource-section" key={key}>
                  <div className="learning-section-heading"><div><Icon size={18} /><h4>{title}</h4></div><span>{hint}</span></div>
                  <div className="learning-resource-grid">
                    {learningResources.filter((resource) => resource.category === key).map((resource) => <button className={`learning-resource-card resource-${resource.color}`} key={resource.name} onClick={() => openLearningResource(resource)}>
                      <div><Library size={18} /></div><span><b>{resource.name}</b><small>{resource.description}</small></span><ExternalLink size={16} />
                    </button>)}
                  </div>
                </section>)}

                <div className="learning-safety-note"><Sparkles size={16} /><span>建议优先选择大学、官方文档和高质量课程，并用课件定义交叉核对搜索结果。</span></div>
              </div>
            ) : pdfUrl && sourceType === "pdf" ? (
              <iframe key={viewerSource.page} className="pdf-page-frame" title={`原课件第 ${viewerSource.page} 页`} src={`${pdfUrl}#page=${viewerSource.page}&view=FitH`} />
            ) : (
              <article className="slide-text-preview">
                <div className="slide-page-label">{sourceType === "pptx" ? "PPTX" : sourceType === "demo" ? "DEMO" : "TEXT"} · PAGE {viewerSource.page}</div>
                <div className="slide-text-content">
                  {cleanLines(viewerSource.text).map((line, index) => index === 0 ? <h3 key={`${line}-${index}`}>{line}</h3> : <p key={`${line}-${index}`}>{line}</p>)}
                </div>
                <div className="source-viewer-note"><Eye size={15} />PPTX 与文字材料显示该页提取原文；上传 PDF 时会直接显示原始页面。</div>
              </article>
            )}
          </div>

          <SheetFooter className="source-viewer-footer">
            <div><span>当前对应节点</span><b>{viewerNode?.id} · {viewerNode?.title}</b></div>
            <div className="source-viewer-actions">
              {viewerMode === "source" ? <Button className="deep-learning-button" onClick={() => setViewerMode("learn")}><GraduationCap />深入学习本页<Sparkles /></Button> : <Button variant="outline" onClick={() => setViewerMode("source")}><ChevronLeft />返回原课件</Button>}
              <SheetClose asChild><Button variant={viewerMode === "source" ? "outline" : "default"}>返回知识节点</Button></SheetClose>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

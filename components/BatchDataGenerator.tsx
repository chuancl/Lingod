
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
    Play, Download, Trash2, ChevronRight, ChevronDown, List, MapPin, 
    Database, Send, AlertCircle, Code, Save, RotateCcw, RotateCw, 
    Eraser, LayoutGrid, FileJson, CheckSquare, Square, Plus, 
    CheckCircle, BookOpen, GraduationCap, Loader2, FileUp, Eye,
    UploadCloud, DownloadCloud, Scale, Image as ImageIcon, Video,
    Quote, Globe, Star, Info, GripVertical, FileDown, BarChart2, Youtube, ExternalLink
} from 'lucide-react';
import { Logo } from './Logo';
import { Toast, ToastMessage } from './ui/Toast';
import { WordCategory, WordEntry } from '../types';
import { entriesStorage } from '../utils/storage';
import { storage } from 'wxt/storage';

// 映射可用字段
const MAPPING_FIELDS = [
    { id: 'text', label: '单词拼写 (text)' },
    { id: 'translation', label: '中文释义 (translation)' },
    { id: 'phoneticUs', label: '美式音标 (phoneticUs)' },
    { id: 'phoneticUk', label: '英式音标 (phoneticUk)' },
    { id: 'partOfSpeech', label: '词性 (partOfSpeech)' },
    { id: 'englishDefinition', label: '英文定义 (englishDefinition)' },
    { id: 'inflections', label: '词态变化 (inflections)', type: 'array' },
    { id: 'dictionaryExample', label: '词典例句 (dictionaryExample)' },
    { id: 'dictionaryExampleTranslation', label: '词典例句翻译 (dictionaryExampleTranslation)' },
    { id: 'contextSentence', label: '来源原句 (contextSentence)' },
    { id: 'contextSentenceTranslation', label: '来源原句翻译 (contextSentenceTranslation)' },
    { id: 'mixedSentence', label: '中英混合例句 (mixedSentence)' },
    { id: 'phrases', label: '常用短语 (phrases)', type: 'array' },
    { id: 'roots', label: '词根词缀 (roots)', type: 'array' },
    { id: 'synonyms', label: '近义词 (synonyms)', type: 'array' },
    { id: 'tags', label: '标签 (tags)', type: 'array' },
    { id: 'importance', label: '柯林斯星级 (importance)', type: 'number' },
    { id: 'cocaRank', label: 'COCA排名 (cocaRank)', type: 'number' },
    { id: 'image', label: '图片 URL (image)' },
    { id: 'sourceUrl', label: '来源/维基地址 (sourceUrl)' },
    { id: 'videoUrl', label: '视频-播放地址 (video.url)' },
    { id: 'videoTitle', label: '视频-标题 (video.title)' },
    { id: 'videoCover', label: '视频-封面 (video.cover)' }
];

interface MappingConfig {
    path: string;
    field: string;
    weight: number; 
    isBase?: boolean; // 是否为基本信息
}

interface ListConfig {
    path: string;
}

interface RuleSet {
    apiUrl: string;
    mappings: MappingConfig[];
    lists: ListConfig[];
    updatedAt: number;
}

interface HistoryStep {
    mappings: MappingConfig[];
    lists: ListConfig[];
}

const RULES_STORAGE_KEY = 'local:batch-generator-rules';
const MAX_DEPTH = 50;

export const BatchDataGenerator: React.FC = () => {
    const [apiUrl, setApiUrl] = useState('https://dict.youdao.com/jsonapi?q={word}');
    const [importedWords, setImportedWords] = useState<string[]>([]);
    const [jsonData, setJsonData] = useState<any>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // UI 布局状态：左侧面板宽度（百分比）
    const [leftPanelWidth, setLeftPanelWidth] = useState(40);
    const resizerRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const ruleImportRef = useRef<HTMLInputElement>(null);

    const [mappings, setMappings] = useState<MappingConfig[]>([]);
    const [lists, setLists] = useState<ListConfig[]>([]);
    
    const [history, setHistory] = useState<HistoryStep[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const [previewMode, setPreviewMode] = useState<'json' | 'cards'>('cards');
    const [previewResult, setPreviewResult] = useState<any[] | null>(null);
    const [selectedPreviewIds, setSelectedPreviewIds] = useState<Set<number>>(new Set());
    
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const showToast = (message: string, type: ToastMessage['type'] = 'success') => setToast({ id: Date.now(), message, type });

    // 左右拖拽逻辑
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        isResizing.current = true;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        const offset = (e.clientX / window.innerWidth) * 100;
        if (offset > 15 && offset < 85) {
            setLeftPanelWidth(offset);
        }
    }, []);

    const onMouseUp = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    // 规则持久化逻辑
    const loadRulesForApi = async (url: string) => {
        const allRules = await storage.getItem<Record<string, RuleSet>>(RULES_STORAGE_KEY) || {};
        const rule = allRules[url];
        if (rule) {
            setMappings(rule.mappings || []);
            setLists(rule.lists || []);
            saveHistory(rule.mappings || [], rule.lists || [], false);
        } else {
            setMappings([]); setLists([]); saveHistory([], [], false);
        }
    };

    useEffect(() => { if (apiUrl) loadRulesForApi(apiUrl); }, [apiUrl]);

    useEffect(() => {
        if (!apiUrl || historyIndex === -1) return;
        const timer = setTimeout(async () => {
            const allRules = await storage.getItem<Record<string, RuleSet>>(RULES_STORAGE_KEY) || {};
            allRules[apiUrl] = { apiUrl, mappings, lists, updatedAt: Date.now() };
            await storage.setItem(RULES_STORAGE_KEY, allRules);
        }, 1000);
        return () => clearTimeout(timer);
    }, [mappings, lists, apiUrl]);

    const saveHistory = (m: MappingConfig[], l: ListConfig[], shouldPush = true) => {
        if (!shouldPush) { setHistory([{ mappings: [...m], lists: [...l] }]); setHistoryIndex(0); return; }
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ mappings: [...m], lists: [...l] });
        if (newHistory.length > 50) newHistory.shift();
        setHistory(newHistory); setHistoryIndex(newHistory.length - 1);
    };

    const undo = () => { if (historyIndex > 0) { const p = history[historyIndex - 1]; setMappings(p.mappings); setLists(p.lists); setHistoryIndex(historyIndex - 1); } };
    const redo = () => { if (historyIndex < history.length - 1) { const n = history[historyIndex + 1]; setMappings(n.mappings); setLists(n.lists); setHistoryIndex(historyIndex + 1); } };
    const clearAll = () => { setMappings([]); setLists([]); saveHistory([], []); showToast('配置已清空', 'info'); };

    const normalizePath = (path: string) => path.replace(/\.\d+/g, '');

    const fetchTemplateData = async (word: string) => {
        if (!word) return;
        setIsFetching(true);
        try {
            const res = await fetch(apiUrl.replace('{word}', encodeURIComponent(word)));
            const data = await res.json();
            setJsonData(data);
            showToast(`已获取 "${word}" 的数据结构`, 'success');
        } catch (e: any) { showToast(`获取失败: ${e.message}`, 'error'); } 
        finally { setIsFetching(false); }
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const words = text.split(/[\n,，\r]/).map(w => w.trim()).filter(Boolean);
            if (words.length > 0) { setImportedWords(words); fetchTemplateData(words[0]); }
        };
        reader.readAsText(file);
    };

    const handleExportRules = () => {
        const config = { apiUrl, mappings, lists };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reword_batch_rules_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportRules = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target?.result as string);
                if (config.apiUrl) setApiUrl(config.apiUrl);
                if (config.mappings) setMappings(config.mappings);
                if (config.lists) setLists(config.lists);
                showToast('解析规则导入成功');
            } catch(e) { showToast('导入格式错误', 'error'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleExportBatchData = () => {
        if (!previewResult) return;
        const blob = new Blob([JSON.stringify(previewResult, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reword_final_data_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('批导数据导出成功');
    };

    const isListPath = (path: string) => lists.some(l => l.path === normalizePath(path));
    const getMapping = (path: string) => mappings.find(m => m.path === normalizePath(path));

    const toggleList = (path: string) => {
        const nPath = normalizePath(path);
        let newLists = lists.some(l => l.path === nPath) ? lists.filter(l => l.path !== nPath) : [...lists, { path: nPath }];
        setLists(newLists); saveHistory(mappings, newLists);
    };

    const setMapping = (path: string, field: string) => {
        const nPath = normalizePath(path);
        let newMappings;
        if (!field) { newMappings = mappings.filter(m => m.path !== nPath); } 
        else {
            const existing = mappings.find(m => m.path === nPath);
            if (existing) { newMappings = mappings.map(m => m.path === nPath ? { ...m, field } : m); } 
            else { newMappings = [...mappings, { path: nPath, field, weight: 1, isBase: false }]; }
        }
        setMappings(newMappings); saveHistory(newMappings, lists);
    };

    const toggleBaseInfo = (path: string) => {
        const nPath = normalizePath(path);
        const newMappings = mappings.map(m => m.path === nPath ? { ...m, isBase: !m.isBase } : m);
        setMappings(newMappings); saveHistory(newMappings, lists);
    };

    const setWeight = (path: string, weight: number) => {
        const nPath = normalizePath(path);
        const newMappings = mappings.map(m => m.path === nPath ? { ...m, weight } : m);
        setMappings(newMappings); saveHistory(newMappings, lists);
    };

    const renderNode = (key: string, value: any, path: string, depth: number) => {
        const isObject = value !== null && typeof value === 'object';
        const isExpanded = expandedPaths.has(path);
        const mapping = getMapping(path);
        const isList = isListPath(path);

        return (
            <div key={path} className="select-none">
                <div className={`flex items-center gap-2 py-1.5 px-3 rounded-xl transition-all group mb-1 border
                        ${isList ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-100' : 
                          mapping?.isBase ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-100' : 
                          mapping ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-100' : 'border-transparent hover:bg-slate-50'}`}
                    style={{ marginLeft: `${depth * 20}px` }}>
                    {isObject ? (
                        <button onClick={() => {const n = new Set(expandedPaths); isExpanded ? n.delete(path) : n.add(path); setExpandedPaths(n);}} className="p-1 hover:bg-white rounded-md shrink-0">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                        </button>
                    ) : <div className="w-6 shrink-0" />}

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`font-mono text-sm font-bold shrink-0 ${isList ? 'text-purple-700' : mapping?.isBase ? 'text-amber-700' : mapping ? 'text-blue-700' : 'text-slate-600'}`}>{key}</span>
                        {!isObject && <span className="text-sm text-slate-400 truncate font-mono italic" title={String(value)}>: {typeof value === 'string' ? `"${value}"` : String(value)}</span>}
                    </div>

                    <div className={`flex items-center gap-1.5 shrink-0 ${isList || mapping ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button onClick={() => toggleList(path)} className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border flex items-center gap-1 ${isList ? 'bg-purple-600 text-white' : 'bg-white text-slate-400 hover:border-purple-400'}`}>
                            <List className="w-3 h-3" /> {isList ? 'LIST' : 'SET LIST'}
                        </button>
                        
                        <div className="flex items-center gap-1">
                            <select value={mapping?.field || ''} onChange={(e) => setMapping(path, e.target.value)} className={`text-[10px] font-bold h-8 rounded-lg border outline-none px-2 ${mapping ? (mapping.isBase ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white') : 'bg-white text-slate-400'}`}>
                                <option value="">MAP FIELD...</option>
                                {MAPPING_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                            
                            {mapping && (
                                <>
                                    <button 
                                        onClick={() => toggleBaseInfo(path)}
                                        className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-[10px] font-bold transition-all ${mapping.isBase ? 'bg-amber-100 border-amber-400 text-amber-700 shadow-inner' : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300'}`}
                                        title="标记为基本信息：生成的每个单词义项都将包含此字段"
                                    >
                                        <Info className="w-3.5 h-3.5" /> BASE
                                    </button>
                                    <select value={mapping.weight} onChange={(e) => setWeight(path, parseInt(e.target.value))} className="text-[10px] font-black text-blue-600 bg-white border border-slate-200 rounded-lg h-8 px-1">
                                        {[1,2,3,4,5,6,7,8,9].map(w => <option key={w} value={w}>W{w}</option>)}
                                    </select>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                {isObject && isExpanded && (
                    <div className="border-l-2 border-slate-100 ml-4.5 my-0.5">
                        {Object.entries(value).map(([k, v]) => renderNode(k, v, `${path}.${k}`, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    /**
     * 解析引擎深度重构：支持深度上下文继承 (修复嵌套 List 属性丢失问题)
     */
    const runGeneration = async (isFull: boolean) => {
        const words = isFull ? importedWords : importedWords.slice(0, 1);
        if (words.length === 0) { showToast('请先导入单词列表', 'warning'); return; }

        setIsGenerating(true);
        const allFinalResults: any[] = [];
        const mappingConfigs = mappings;
        const listPaths = new Set(lists.map(l => l.path));

        // 数据清洗工具
        const sanitize = (val: any) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'number') return val;
            if (Array.isArray(val)) return sanitize(val[0]);
            if (typeof val === 'object') {
                const keys = ['text', 'value', 'word', 'chn_tran', 'tran', 'definition', 'i'];
                for (const k of keys) if (val[k]) return sanitize(val[k]);
                return JSON.stringify(val);
            }
            return String(val);
        };

        // 辅助：从对象中收集映射字段 (Pre-scan)
        const collectContextFromObject = (obj: any, currentPath: string, ctx: Map<string, any[]>) => {
            if (!obj || typeof obj !== 'object') return;
            Object.entries(obj).forEach(([k, v]) => {
                const propPath = `${currentPath}.${k}`;
                const normPropPath = normalizePath(propPath);
                
                // 查找针对此属性的映射 (非 Base)
                mappingConfigs.filter(m => m.path === normPropPath && !m.isBase).forEach(m => {
                    const arr = ctx.get(m.field) || [];
                    // 将值保存到上下文中
                    ctx.set(m.field, [...arr, { val: v, w: m.weight }]); // 暂存原始值，finalize时再清洗
                });
            });
        };

        try {
            for (const word of words) {
                const url = apiUrl.replace('{word}', encodeURIComponent(word));
                const res = await fetch(url);
                const data = await res.json();
                const wordFinalEntries: any[] = [];

                // 第一阶段：全局预抓取 BASE 字段
                const globalBase = new Map<string, Array<{val: any, w: number}>>();
                const collectBase = (n: any, p: string, d: number) => {
                    if (d > MAX_DEPTH) return;
                    const np = normalizePath(p);
                    mappingConfigs.filter(m => m.path === np && m.isBase).forEach(m => {
                        const arr = globalBase.get(m.field) || [];
                        globalBase.set(m.field, [...arr, { val: n, w: m.weight }]);
                    });
                    if (n && typeof n === 'object') Object.entries(n).forEach(([k, v]) => collectBase(v, `${p}.${k}`, d + 1));
                };
                collectBase(data, 'root', 0);

                // 核心：产出词条
                const finalize = (ctx: Map<string, any[]>) => {
                    const entry: any = { text: word };
                    // 合并：当前路径上下文 + 全局基础
                    const combined = new Map(ctx);
                    globalBase.forEach((v, k) => combined.set(k, [...(combined.get(k) || []), ...v]));

                    combined.forEach((candidates, field) => {
                        const sorted = candidates.sort((a, b) => a.w - b.w);
                        for (const cand of sorted) {
                            if (cand.val !== undefined && cand.val !== null) {
                                entry[field] = sanitize(cand.val); break;
                            }
                        }
                    });

                    // 兼容处理
                    if (entry.videoUrl) {
                        entry.video = { url: entry.videoUrl, title: entry.videoTitle || '讲解', cover: entry.videoCover || '' };
                        delete entry.videoUrl; delete entry.videoTitle; delete entry.videoCover;
                    }
                    ['inflections', 'tags', 'phrases', 'roots', 'synonyms'].forEach(f => {
                        if (entry[f] && typeof entry[f] === 'string') entry[f] = entry[f].split(/[,，;；]/).map((s: string) => s.trim()).filter(Boolean);
                    });

                    if (Object.keys(entry).length > 1) wordFinalEntries.push(entry);
                };

                /**
                 * 递归遍历：向下钻取时携带 Context 继承
                 */
                const traverse = (node: any, path: string, inheritedCtx: Map<string, any[]>, depth: number) => {
                    if (depth > MAX_DEPTH) return;
                    const nPath = normalizePath(path);
                    
                    // 1. 准备当前层级的上下文 (克隆继承)
                    const currentCtx = new Map(inheritedCtx);

                    // 2. 预扫描当前节点 (如果是对象)，将该节点下的直接属性映射加入 Context
                    // 这样，如果是 { pos: 'n', list: [...] } 结构，处理 list 前 pos 已经被捕获
                    if (node && typeof node === 'object' && !Array.isArray(node)) {
                        collectContextFromObject(node, path, currentCtx);
                    }

                    // 3. 分支逻辑：是否为 LIST 节点
                    if (listPaths.has(nPath) && node) {
                        const items = Array.isArray(node) ? node : [node];
                        items.forEach((item, idx) => {
                            const subInstancePath = Array.isArray(node) ? `${path}.${idx}` : path;
                            
                            // 3.1 为列表项创建上下文
                            const itemCtx = new Map(currentCtx);
                            
                            // 3.2 关键修复：预扫描列表项本身
                            // 例如 item 是 { partofspeech: 'n', senses: [...] }
                            // 必须先收集 partofspeech，再进入 senses
                            if (item && typeof item === 'object') {
                                collectContextFromObject(item, subInstancePath, itemCtx);
                            }

                            // 3.3 检查是否需要继续深层递归（是否存在更深层的 LIST）
                            const hasSubList = Array.from(listPaths).some(lp => lp.startsWith(nPath + '.') && lp !== nPath);
                            
                            if (hasSubList && item && typeof item === 'object') {
                                // 还没到叶子 LIST，继续向下，传递携带了当前项属性的 itemCtx
                                Object.keys(item).forEach(k => {
                                    traverse(item[k], `${subInstancePath}.${k}`, itemCtx, depth + 1);
                                });
                            } else {
                                // 到达叶子节点，或者没有更深的 LIST 了
                                // 进行深度扫描以捕获该项内部所有剩余的映射字段（如 example, trans）
                                const leafCtx = new Map(itemCtx);
                                const deepCollect = (nn: any, pp: string, dd: number) => {
                                    if (dd > MAX_DEPTH) return;
                                    if (nn && typeof nn === 'object') {
                                        collectContextFromObject(nn, pp, leafCtx);
                                        Object.entries(nn).forEach(([kk, vv]) => deepCollect(vv, `${pp}.${kk}`, dd + 1));
                                    }
                                };
                                // 对当前项内部进行全量深度扫描
                                if (item && typeof item === 'object') {
                                     // 避免重复扫描顶层属性 (3.2已做)，直接扫描子属性
                                     Object.entries(item).forEach(([kk, vv]) => deepCollect(vv, `${subInstancePath}.${kk}`, depth + 1));
                                } else {
                                     // 简单值的情况（很少见，通常列表项是对象）
                                     // 这种情况下该值本身可能就是一个映射目标，但在上面的 collectContextFromObject 逻辑里是处理对象属性的
                                     // 如果 list item 是 string，且有映射指向 list path 本身... 暂不处理复杂 edge case，通常是对象
                                }
                                finalize(leafCtx);
                            }
                        });
                    } else if (node && typeof node === 'object') {
                        // 普通对象节点，继续递归
                        Object.keys(node).forEach(k => traverse(node[k], `${path}.${k}`, currentCtx, depth + 1));
                    }
                };

                traverse(data, 'root', new Map(), 0);

                // 兜底：如果完全没有 LIST 标记，基于 ROOT 尝试生成一次
                if (wordFinalEntries.length === 0 && mappingConfigs.length > 0 && lists.length === 0) {
                    const rootCtx = new Map();
                    const deepCollectRoot = (n: any, p: string, d: number) => {
                        if (d > MAX_DEPTH) return;
                        if (n && typeof n === 'object') {
                            collectContextFromObject(n, p, rootCtx);
                            Object.entries(n).forEach(([k, v]) => deepCollectRoot(v, `${p}.${k}`, d + 1));
                        }
                    };
                    deepCollectRoot(data, 'root', 0);
                    finalize(rootCtx);
                }

                allFinalResults.push(...wordFinalEntries);
            }
            setPreviewResult(allFinalResults);
            setSelectedPreviewIds(new Set(allFinalResults.map((_, i) => i)));
            showToast(isFull ? `全量生成完成：共产出 ${allFinalResults.length} 个条目` : '预览生成成功');
        } catch (e: any) { showToast(`解析失败: ${e.message}`, 'error'); } 
        finally { setIsGenerating(false); }
    };

    const handleImportToStorage = async (category: WordCategory) => {
        const selected = previewResult?.filter((_, idx) => selectedPreviewIds.has(idx)) || [];
        const current = await entriesStorage.getValue();
        const newOnes = selected.map(item => ({
            ...item, id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            category, addedAt: Date.now(), scenarioId: '1'
        }));
        await entriesStorage.setValue([...current, ...newOnes]);
        showToast(`成功导入 ${newOnes.length} 个单词至 "${category}"`);
        setPreviewResult(previewResult?.filter((_, idx) => !selectedPreviewIds.has(idx)) || null);
    };

    return (
        <div className="fixed inset-0 bg-slate-50 flex flex-col overflow-hidden font-sans">
            <header className="bg-white border-b border-slate-200 px-8 h-20 flex items-center justify-between shrink-0 shadow-sm z-50">
                <Logo />
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <div className="flex items-center px-4 py-2 gap-3">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="bg-transparent border-none outline-none text-xs w-[32rem] font-mono text-slate-700" placeholder="输入 API 地址..."/>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExportRules} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" title="导出配置"><DownloadCloud className="w-5 h-5"/></button>
                        <button onClick={() => ruleImportRef.current?.click()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" title="导入配置"><UploadCloud className="w-5 h-5"/></button>
                        <input type="file" ref={ruleImportRef} className="hidden" accept=".json" onChange={handleImportRules} />
                    </div>
                    <div className="h-8 w-px bg-slate-200 mx-2"></div>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-6 h-11 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-md flex items-center gap-2">
                        <FileUp className="w-4 h-4" /> 导入待解析 TXT
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".txt" onChange={handleFileImport} />
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden relative">
                {/* 左侧：规则面板 */}
                <div className="flex flex-col bg-white border-r border-slate-200 overflow-hidden" style={{ width: `${leftPanelWidth}%` }}>
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Database className="w-4 h-4 text-blue-600"/> 解析规则与分枝配置</h3>
                        <div className="flex gap-1">
                            <button onClick={undo} disabled={historyIndex <= 0} className="p-2 disabled:opacity-30"><RotateCcw className="w-4 h-4" /></button>
                            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 disabled:opacity-30"><RotateCw className="w-4 h-4" /></button>
                            <button onClick={clearAll} className="p-2 hover:text-red-500"><Eraser className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-white">
                        {jsonData ? renderNode('ROOT', jsonData, 'root', 0) : <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-sm p-12 text-center"><Database className="w-12 h-12 mb-4 opacity-5"/><p>点击上方按钮导入单词列表。系统支持笛卡尔积解析，<br/>子级义项会自动继承父级属性（如词性）。</p></div>}
                    </div>
                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                         <div className="flex gap-6 text-[10px] font-black text-slate-400 uppercase">
                            <div>LISTS: <span className="text-purple-600 text-lg">{lists.length}</span></div>
                            <div>MAPS: <span className="text-blue-600 text-lg">{mappings.length}</span></div>
                         </div>
                         <div className="flex gap-3">
                            <button onClick={() => runGeneration(false)} disabled={!jsonData || isGenerating} className="bg-white text-slate-700 border border-slate-200 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-50 transition active:scale-95"><Eye className="w-4 h-4" /> 义项预览</button>
                            <button onClick={() => runGeneration(true)} disabled={!jsonData || isGenerating} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-3 hover:bg-black shadow-xl transition active:scale-95">{isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />} 批量全量处理</button>
                         </div>
                    </div>
                </div>

                {/* 缩放 Resizer */}
                <div 
                    className="w-1 hover:w-2 bg-slate-100 hover:bg-blue-400 cursor-col-resize transition-all flex items-center justify-center"
                    onMouseDown={onMouseDown}
                >
                    <div className="h-8 w-1 rounded-full bg-slate-300"></div>
                </div>

                {/* 右侧：预览面板 */}
                <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
                        <div className="flex items-center gap-4">
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-sm">
                                <button onClick={() => setPreviewMode('cards')} className={`p-1.5 rounded-md ${previewMode === 'cards' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-white'}`}><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setPreviewMode('json')} className={`p-1.5 rounded-md ${previewMode === 'json' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-white'}`}><FileJson className="w-4 h-4" /></button>
                            </div>
                            <h3 className="font-black text-slate-800 text-sm">生成预览 (条目数: {previewResult?.length || 0})</h3>
                        </div>
                        {previewResult && previewResult.length > 0 && (
                            <div className="flex items-center gap-2">
                                {previewMode === 'json' ? (
                                    <button onClick={handleExportBatchData} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition"><FileDown className="w-4 h-4"/> 导出批导数据 (JSON)</button>
                                ) : (
                                    <>
                                        <button onClick={() => handleImportToStorage(WordCategory.WantToLearnWord)} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-100 transition"><Plus className="w-3 h-3"/>想学</button>
                                        <button onClick={() => handleImportToStorage(WordCategory.LearningWord)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 text-[10px] font-bold flex items-center gap-1 hover:bg-blue-100 transition"><BookOpen className="w-3 h-3"/>在学</button>
                                        <button onClick={() => handleImportToStorage(WordCategory.KnownWord)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-100 transition"><GraduationCap className="w-3 h-3"/>掌握</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className={`flex-1 overflow-auto custom-scrollbar p-6 ${previewMode === 'json' ? 'bg-slate-900' : ''}`}>
                        {previewResult ? (
                            previewMode === 'json' ? <pre className="text-emerald-400 text-xs font-mono">{JSON.stringify(previewResult, null, 2)}</pre> : (
                                <div className="space-y-4">
                                    <div className="flex items-center text-[10px] font-bold text-slate-400 gap-4 mb-2">
                                        <button onClick={() => setSelectedPreviewIds(selectedPreviewIds.size === previewResult.length ? new Set() : new Set(previewResult.map((_, i) => i)))} className="flex items-center gap-1 hover:text-slate-700">{selectedPreviewIds.size === previewResult.length ? <CheckSquare className="w-4 h-4 text-blue-600"/> : <Square className="w-4 h-4"/>} 全选/取消</button>
                                    </div>
                                    {previewResult.map((item, idx) => (
                                        <div key={idx} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all p-5 flex gap-4 group ${selectedPreviewIds.has(idx) ? 'border-blue-400 ring-1 ring-blue-100 shadow-md' : 'border-slate-200'}`}>
                                            <div className="pt-1.5">
                                                <button onClick={() => {const n = new Set(selectedPreviewIds); if(n.has(idx)) n.delete(idx); else n.add(idx); setSelectedPreviewIds(n);}}>
                                                    {selectedPreviewIds.has(idx) ? <CheckSquare className="w-5 h-5 text-blue-600"/> : <Square className="w-5 h-5 text-slate-300"/>}
                                                </button>
                                            </div>
                                            <div className="flex-1 space-y-4 min-w-0">
                                                {/* Header Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{item.text}</h3>
                                                        
                                                        {item.partOfSpeech && (
                                                            <span className="font-serif font-bold text-sm text-slate-400 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-100">{item.partOfSpeech}</span>
                                                        )}

                                                        {(item.phoneticUs || item.phoneticUk) && (
                                                            <div className="flex items-center text-sm text-slate-500 space-x-3 font-mono bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                                                {item.phoneticUs && <span><span className="text-[10px] mr-1 text-slate-400 font-sans">US</span> {item.phoneticUs}</span>}
                                                                {item.phoneticUk && <span><span className="text-[10px] mr-1 text-slate-400 font-sans">UK</span> {item.phoneticUk}</span>}
                                                            </div>
                                                        )}
                                                        
                                                        {item.translation && (
                                                            <div className="text-slate-700 font-medium px-3 py-1 bg-amber-50 text-amber-900 rounded-lg border border-amber-100 text-sm">
                                                                {item.translation}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="ml-auto sm:ml-0 self-start sm:self-center flex flex-col items-end gap-1.5">
                                                        {item.tags && item.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 justify-end">
                                                                {item.tags.map((t: string, i: number) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 whitespace-nowrap">{t}</span>)}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                                            {item.importance && (
                                                                <div className="flex" title={`Collins Level ${item.importance}`}>
                                                                    {[...Array(5)].map((_, i) => (
                                                                        <Star key={i} className={`w-3 h-3 ${i < item.importance ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {item.cocaRank && (
                                                                <span className="flex items-center" title="COCA 词频排名"><BarChart2 className="w-3 h-3 mr-1"/> #{item.cocaRank}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Media Row: Image & Video */}
                                                {(item.image || item.video) && (
                                                    <div className="flex gap-4">
                                                        {item.image && (
                                                            <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center relative group/img">
                                                                <img src={item.image} className="w-full h-full object-cover" />
                                                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center"><ImageIcon className="w-4 h-4 text-white drop-shadow-md"/></div>
                                                            </div>
                                                        )}
                                                        {item.video && (
                                                            <a href={item.video.url} target="_blank" className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2 pr-4 hover:bg-slate-100 transition group/vid max-w-xs">
                                                                <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                                    {item.video.cover && <img src={item.video.cover} className="absolute inset-0 w-full h-full object-cover opacity-60"/>}
                                                                    <Youtube className="w-5 h-5 text-red-500 relative z-10"/>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-bold text-slate-700 truncate">{item.video.title}</div>
                                                                    <div className="text-[10px] text-slate-400">视频讲解</div>
                                                                </div>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Details Grid */}
                                                <div className="grid grid-cols-1 gap-4">
                                                    {item.inflections && item.inflections.length > 0 && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-orange-400 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">词态变化 (Morphology)</span>
                                                            <div className="flex flex-wrap gap-2 pl-2">
                                                                {item.inflections.map((inf: string, i: number) => <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600 font-mono">{inf}</span>)}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {item.phrases && item.phrases.length > 0 && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-indigo-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">常用短语 (Phrases)</span>
                                                            <div className="flex flex-wrap gap-2 pl-2">
                                                                {item.phrases.map((p: string, i: number) => <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">{p}</span>)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {item.roots && item.roots.length > 0 && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-rose-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">词根词缀 (Roots)</span>
                                                            <div className="flex flex-wrap gap-2 pl-2">
                                                                {item.roots.map((r: string, i: number) => <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">{r}</span>)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {item.synonyms && item.synonyms.length > 0 && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-cyan-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">近义词 (Synonyms)</span>
                                                            <div className="flex flex-wrap gap-2 pl-2">
                                                                {item.synonyms.map((s: string, i: number) => <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">{s}</span>)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Context Sentence */}
                                                    {item.contextSentence && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative group/ctx hover:bg-slate-100 transition">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-blue-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">来源原句 (Context)</span>
                                                            <p className="text-sm text-slate-700 leading-relaxed pl-2 mb-1">{item.contextSentence}</p>
                                                            {item.contextSentenceTranslation && <p className="text-xs text-slate-500 pl-2">{item.contextSentenceTranslation}</p>}
                                                            {item.sourceUrl && (
                                                                <div className="pl-2 mt-2 pt-2 border-t border-slate-200/50 flex items-center gap-3">
                                                                    <a href={item.sourceUrl} target="_blank" className="flex items-center text-xs text-blue-600 hover:underline"><ExternalLink className="w-3 h-3 mr-1" /> 来源</a>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Mixed Sentence */}
                                                    {item.mixedSentence && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative hover:bg-slate-100 transition">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-purple-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">中英混合 (Mixed)</span>
                                                            <p className="text-sm text-slate-700 leading-relaxed pl-2">{item.mixedSentence}</p>
                                                        </div>
                                                    )}

                                                    {/* Dictionary Example */}
                                                    {item.dictionaryExample && (
                                                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 relative hover:bg-slate-100 transition">
                                                            <div className="absolute left-0 top-3 w-1 h-8 bg-emerald-500 rounded-r"></div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 pl-2">词典例句 (Dictionary)</span>
                                                            <p className="text-sm text-slate-600 italic leading-relaxed pl-2 mb-1">{item.dictionaryExample}</p>
                                                            {item.dictionaryExampleTranslation && <p className="text-xs text-slate-500 pl-2">{item.dictionaryExampleTranslation}</p>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : <div className="h-full flex flex-col items-center justify-center text-slate-300 font-bold opacity-30 uppercase tracking-widest text-xs"><Code className="w-16 h-16 mb-4 opacity-5"/> Waiting for Data...</div>}
                    </div>
                </div>
            </main>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};

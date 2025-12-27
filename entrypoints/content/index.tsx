
import ReactDOM from 'react-dom/client';
import React, { useState, useEffect, useRef } from 'react';
import { PageWidget } from '../../components/PageWidget';
import { WordBubble } from '../../components/WordBubble';
import '../../index.css'; 
import { entriesStorage, pageWidgetConfigStorage, autoTranslateConfigStorage, stylesStorage, originalTextConfigStorage, enginesStorage, interactionConfigStorage } from '../../utils/storage';
import { WordEntry, PageWidgetConfig, WordInteractionConfig, WordCategory, AutoTranslateConfig, ModifierKey, StyleConfig, OriginalTextConfig } from '../../types';
import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import { findFuzzyMatches, findAggressiveMatches } from '../../utils/matching';
import { buildReplacementHtml } from '../../utils/dom-builder';
import { browser } from 'wxt/browser';
import { preloadVoices, unlockAudio } from '../../utils/audio';
import { splitTextIntoSentences, normalizeEnglishText } from '../../utils/text-processing';

interface ContentOverlayProps {
  initialWidgetConfig: PageWidgetConfig;
  initialEntries: WordEntry[];
  initialInteractionConfig: WordInteractionConfig;
  initialAutoTranslateConfig: AutoTranslateConfig; 
}

interface ActiveBubble {
    id: string; 
    entry: WordEntry;
    originalText: string;
    rect: DOMRect;
    triggerElement?: HTMLElement;
}

const ContentOverlay: React.FC<ContentOverlayProps> = ({ 
    initialWidgetConfig, 
    initialEntries, 
    initialInteractionConfig,
    initialAutoTranslateConfig 
}) => {
  const [widgetConfig, setWidgetConfig] = useState(initialWidgetConfig);
  const [interactionConfig, setInteractionConfig] = useState(initialInteractionConfig);
  const [autoTranslateConfig, setAutoTranslateConfig] = useState(initialAutoTranslateConfig);
  const [entries, setEntries] = useState(initialEntries);
  const [pageWords, setPageWords] = useState<WordEntry[]>([]);
  const [activeBubbles, setActiveBubbles] = useState<ActiveBubble[]>([]);
  
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const interactionConfigRef = useRef(interactionConfig);
  const entriesRef = useRef(entries);
  
  useEffect(() => { interactionConfigRef.current = interactionConfig; }, [interactionConfig]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => {
    const unsubs = [
        pageWidgetConfigStorage.watch(v => v && setWidgetConfig(v)),
        interactionConfigStorage.watch(v => v && setInteractionConfig(v)),
        entriesStorage.watch(v => v && setEntries(v)),
        autoTranslateConfigStorage.watch(v => v && setAutoTranslateConfig(v)) 
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
      const scanRelevant = () => {
          const text = document.body.innerText;
          const matched = entries.filter(e => {
              const defs = e.translation?.split(/[,;，；/]/) || [];
              return defs.some(d => d.length > 0 && text.includes(d));
          });
          setPageWords(matched);
      };
      scanRelevant();
  }, [entries]);

  useEffect(() => {
      const handleUserInteraction = () => {
          unlockAudio();
          document.removeEventListener('click', handleUserInteraction);
          document.removeEventListener('keydown', handleUserInteraction);
      };
      document.addEventListener('click', handleUserInteraction);
      document.addEventListener('keydown', handleUserInteraction);
      return () => {
          document.removeEventListener('click', handleUserInteraction);
          document.removeEventListener('keydown', handleUserInteraction);
      };
  }, []);

  const checkModifier = (e: MouseEvent, mod: ModifierKey) => {
      if (mod === 'None') return true;
      if (mod === 'Alt') return e.altKey;
      if (mod === 'Ctrl') return e.ctrlKey || e.metaKey; 
      if (mod === 'Shift') return e.shiftKey;
      if (mod === 'Meta') return e.metaKey;
      return true;
  };

  const addBubble = (entry: WordEntry, originalText: string, rect: DOMRect, triggerElement: HTMLElement) => {
      const config = interactionConfigRef.current;
      if (hideTimers.current.has(entry.id)) {
          clearTimeout(hideTimers.current.get(entry.id)!);
          hideTimers.current.delete(entry.id);
      }

      setActiveBubbles(prev => {
          const exists = prev.find(b => b.id === entry.id);
          if (!config.allowMultipleBubbles) {
              return [{ id: entry.id, entry, originalText, rect, triggerElement }];
          } else {
              if (exists) return prev;
              return [...prev, { id: entry.id, entry, originalText, rect, triggerElement }];
          }
      });
  };

  const scheduleRemoveBubble = (id: string) => {
      const config = interactionConfigRef.current;
      if (hideTimers.current.has(id)) clearTimeout(hideTimers.current.get(id)!);
      const timer = setTimeout(() => {
          setActiveBubbles(prev => prev.filter(b => b.id !== id));
          hideTimers.current.delete(id);
      }, config.dismissDelay || 300);
      hideTimers.current.set(id, timer);
  };

  useEffect(() => {
     const handleMouseOver = (e: MouseEvent) => {
         const target = e.target as HTMLElement;
         const entryEl = target.closest('[data-entry-id]') as HTMLElement;
         if (entryEl) {
             const id = entryEl.getAttribute('data-entry-id');
             const originalText = entryEl.getAttribute('data-original-text') || '';
             const entry = entriesRef.current.find(w => w.id === id);
             if (entry && id) {
                 if (hideTimers.current.has(id)) {
                     clearTimeout(hideTimers.current.get(id)!);
                     hideTimers.current.delete(id);
                 }
                 if (interactionConfigRef.current.mainTrigger.action === 'Hover') {
                     if (checkModifier(e, interactionConfigRef.current.mainTrigger.modifier)) {
                         if (showTimer.current) clearTimeout(showTimer.current);
                         showTimer.current = setTimeout(() => {
                            addBubble(entry, originalText, entryEl.getBoundingClientRect(), entryEl);
                         }, interactionConfigRef.current.mainTrigger.delay);
                     }
                 }
             }
         }
     };

     const handleMouseOut = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const entryEl = target.closest('[data-entry-id]');
        if (entryEl) {
            const id = entryEl.getAttribute('data-entry-id');
            if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
            if (id) scheduleRemoveBubble(id);
        }
     };

     const handleTriggerEvent = (e: MouseEvent, actionType: 'Click' | 'DoubleClick' | 'RightClick') => {
         const config = interactionConfigRef.current;
         const target = e.target as HTMLElement;
         const entryEl = target.closest('[data-entry-id]') as HTMLElement;
         
         if (entryEl) {
            const id = entryEl.getAttribute('data-entry-id');
            const originalText = entryEl.getAttribute('data-original-text') || '';
            const entry = entriesRef.current.find(w => w.id === id);
            
            if (entry) {
                if (config.mainTrigger.action === actionType && checkModifier(e, config.mainTrigger.modifier)) {
                    if (actionType === 'RightClick') e.preventDefault();
                    addBubble(entry, originalText, entryEl.getBoundingClientRect(), entryEl);
                } else if (config.quickAddTrigger.action === actionType && checkModifier(e, config.quickAddTrigger.modifier)) {
                    if (actionType === 'RightClick') e.preventDefault();
                    handleCaptureAndAdd(entry.id);
                }
            }
         }
     };

     document.addEventListener('mouseover', handleMouseOver);
     document.addEventListener('mouseout', handleMouseOut);
     document.addEventListener('click', e => handleTriggerEvent(e, 'Click'));
     document.addEventListener('dblclick', e => handleTriggerEvent(e, 'DoubleClick'));
     document.addEventListener('contextmenu', e => handleTriggerEvent(e, 'RightClick'));

     return () => {
         document.removeEventListener('mouseover', handleMouseOver);
         document.removeEventListener('mouseout', handleMouseOut);
     };
  }, []);

  const handleBubbleMouseEnter = (id: string) => {
      if (hideTimers.current.has(id)) {
          clearTimeout(hideTimers.current.get(id)!);
          hideTimers.current.delete(id);
      }
  };

  const handleCaptureAndAdd = async (id: string) => {
      const allEntries = await entriesStorage.getValue();
      const targetEntry = allEntries.find(e => e.id === id);
      if (!targetEntry) return;
      const updates: Partial<WordEntry> = { category: WordCategory.LearningWord, addedAt: Date.now() };
      const newEntries = allEntries.map(e => e.id === id ? { ...e, ...updates } : e);
      await entriesStorage.setValue(newEntries);
      setEntries(newEntries);
  };

  const handleUpdateWordCategory = async (id: string, category: WordCategory) => {
      const allEntries = await entriesStorage.getValue();
      const newEntries = allEntries.map(e => e.id === id ? { ...e, category } : e);
      await entriesStorage.setValue(newEntries);
      setEntries(newEntries);
  };
  
  return (
    <div className="reset-shadow-dom" style={{ all: 'initial', fontFamily: 'sans-serif' }}>
       <PageWidget config={widgetConfig} setConfig={(v) => pageWidgetConfigStorage.setValue(v)} pageWords={pageWords} setPageWords={setPageWords} onBatchAddToLearning={(ids) => ids.forEach(id => handleCaptureAndAdd(id))} />
       {activeBubbles.map(bubble => (
           <WordBubble 
                key={bubble.id} 
                entry={bubble.entry} 
                originalText={bubble.originalText} 
                targetRect={bubble.rect} 
                config={interactionConfig} 
                isVisible={true} 
                onMouseEnter={() => handleBubbleMouseEnter(bubble.id)} 
                onMouseLeave={() => scheduleRemoveBubble(bubble.id)} 
                onUpdateCategory={handleUpdateWordCategory}
                ttsSpeed={autoTranslateConfig.ttsSpeed} 
            />
       ))}
    </div>
  );
};


export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    preloadVoices();
    let currentEntries = await entriesStorage.getValue();
    let currentWidgetConfig = await pageWidgetConfigStorage.getValue();
    let currentAutoTranslate = await autoTranslateConfigStorage.getValue();
    let currentStyles = await stylesStorage.getValue();
    let currentOriginalTextConfig = await originalTextConfigStorage.getValue();
    let currentEngines = await enginesStorage.getValue();
    let currentInteractionConfig = await interactionConfigStorage.getValue();

    // 监听配置更新，确保逻辑实时同步
    autoTranslateConfigStorage.watch(v => { if(v) currentAutoTranslate = v; });
    entriesStorage.watch(v => { if(v) currentEntries = v; });
    enginesStorage.watch(v => { if(v) currentEngines = v; });
    stylesStorage.watch(v => { if(v) currentStyles = v; });

    /**
     * 应用替换逻辑
     */
    const applySentenceScopedReplacements = async (block: HTMLElement, sourceSentences: string[], transSentences: string[]) => {
        const textNodes: Text[] = [];
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let node;
        while(node = walker.nextNode()) {
            if (!node.parentElement?.closest('.context-lingo-wrapper')) textNodes.push(node as Text);
        }

        let fullText = "";
        const nodeMap: { node: Text, start: number, end: number }[] = [];
        textNodes.forEach(n => {
            const val = n.nodeValue || "";
            nodeMap.push({ node: n, start: fullText.length, end: fullText.length + val.length });
            fullText += val;
        });

        // 1. Gather all potential replacements across sentences
        let allPotentialReplacements: { start: number, end: number, entry: WordEntry, matchedWord: string }[] = [];
        let searchCursor = 0;
        
        for (let idx = 0; idx < sourceSentences.length; idx++) {
            const sent = sourceSentences[idx];
            const trans = transSentences[idx] || "";
            const sentStart = fullText.indexOf(sent, searchCursor);
            if (sentStart === -1) continue;
            const sentEnd = sentStart + sent.length;
            searchCursor = sentEnd;

            // Normal Matching
            const matches = findFuzzyMatches(sent, currentEntries, trans);
            matches.forEach(m => {
                let localPos = sent.indexOf(m.text);
                while (localPos !== -1) {
                    allPotentialReplacements.push({ start: sentStart + localPos, end: sentStart + localPos + m.text.length, entry: m.entry, matchedWord: m.matchedWord });
                    localPos = sent.indexOf(m.text, localPos + 1);
                }
            });

            // Aggressive Matching
            if (currentAutoTranslate.aggressiveMode) {
                const normTrans = normalizeEnglishText(trans);
                const potentials = currentEntries.filter(e => normTrans.includes(e.text.toLowerCase()));
                for (const candidate of potentials) {
                    const response = await browser.runtime.sendMessage({ action: 'LOOKUP_WORD_RICH', text: candidate.text }) as any;
                    if (response?.success) {
                        const aggMatches = findAggressiveMatches(sent, candidate, response.data, trans);
                        aggMatches.forEach(m => {
                            let localPos = sent.indexOf(m.text);
                            while (localPos !== -1) {
                                allPotentialReplacements.push({ start: sentStart + localPos, end: sentStart + localPos + m.text.length, entry: m.entry, matchedWord: m.matchedWord });
                                localPos = sent.indexOf(m.text, localPos + 1);
                            }
                        });
                    }
                }
            }
        }

        // 2. Apply Density Filtering Logic
        // Group replacements by category
        const categorizedReplacements: Record<WordCategory, typeof allPotentialReplacements> = {} as any;
        Object.values(WordCategory).forEach(cat => categorizedReplacements[cat] = []);
        
        allPotentialReplacements.forEach(r => {
            if (categorizedReplacements[r.entry.category]) {
                categorizedReplacements[r.entry.category].push(r);
            }
        });

        const finalFilteredReplacements: typeof allPotentialReplacements = [];

        // For each category, apply density limit
        for (const cat of Object.values(WordCategory)) {
            const matches = categorizedReplacements[cat];
            if (matches.length === 0) continue;

            const styleConfig = currentStyles[cat];
            let limit = matches.length; // default: all

            if (styleConfig) {
                if (styleConfig.densityMode === 'count') {
                    limit = styleConfig.densityValue;
                } else if (styleConfig.densityMode === 'percent') {
                    limit = Math.ceil(matches.length * (styleConfig.densityValue / 100));
                }
            }

            // Simple strategy: take first N matches (could be improved to random or distributed)
            // Sorting by position to ensure consistent behavior
            matches.sort((a, b) => a.start - b.start);
            finalFilteredReplacements.push(...matches.slice(0, limit));
        }

        // 3. Apply Replacements to DOM
        // Sort by start position to process sequentially
        finalFilteredReplacements.sort((a, b) => a.start - b.start);
        
        // Remove overlaps (greedy approach: keep first)
        const nonOverlappingReplacements: typeof finalFilteredReplacements = [];
        let occupiedEnd = -1;
        for (const r of finalFilteredReplacements) {
            if (r.start >= occupiedEnd) {
                nonOverlappingReplacements.push(r);
                occupiedEnd = r.end;
            }
        }

        // Perform DOM manipulation
        nonOverlappingReplacements.sort((a, b) => b.start - a.start); // Reverse order for simpler slicing

        let lastStart = Number.MAX_VALUE;
        let lastEntry: WordEntry | null = null;

        nonOverlappingReplacements.forEach(r => {
            // Check for adjacent replacements requiring space
            let addSpace = false;
            // Since we process in reverse (right to left), 'lastStart' refers to the word on the RIGHT (which was processed previously).
            // So if current word's END equals next word's START, they are adjacent.
            // Example: [WordA][WordB]. Processing WordA. r=WordA, last=WordB. r.end === last.start.
            if (lastEntry && r.end === lastStart) {
                // Always add space between adjacent replaced words to prevent text merging
                addSpace = true;
            }

            // Safety check overlap (though already filtered)
            if (r.end <= lastStart) {
                const target = nodeMap.find(n => r.start >= n.start && r.end <= n.end);
                if (target) {
                    const { node, start } = target;
                    const val = node.nodeValue || "";
                    // Calculate local offsets within the node
                    const localStart = r.start - start;
                    const localEnd = r.end - start;

                    // Ensure offsets are valid for current node content
                    if (localStart >= 0 && localEnd <= val.length) {
                        const mid = val.substring(localStart, localEnd);
                        const after = val.substring(localEnd);
                        const before = val.substring(0, localStart);

                        const span = document.createElement('span');
                        span.className = 'context-lingo-word';
                        // Pass specific category styles to builder
                        span.innerHTML = buildReplacementHtml(
                            mid, 
                            r.matchedWord, 
                            r.entry.category, 
                            currentStyles, 
                            currentOriginalTextConfig, 
                            r.entry.id
                        );

                        // Insert After first (order matters when inserting multiple siblings)
                        if (after) {
                            node.parentNode?.insertBefore(document.createTextNode(after), node.nextSibling);
                        }
                        
                        // Insert Space if needed (Between current word and next word)
                        if (addSpace) {
                            node.parentNode?.insertBefore(document.createTextNode(" "), node.nextSibling);
                        }

                        // Insert Replacement
                        node.parentNode?.insertBefore(span, node.nextSibling);
                        
                        // Update remaining text in original node
                        node.nodeValue = before;
                        
                        lastStart = r.start;
                        lastEntry = r.entry;
                    }
                }
            }
        });
    };

    class TranslationScheduler {
        private buffer: { block: HTMLElement, text: string }[] = [];
        private isProcessing = false;
        add(block: HTMLElement) {
            const text = block.innerText?.trim();
            // 长度限制和中文字符检测
            if (!text || text.length < 5 || !/[\u4e00-\u9fa5]/.test(text)) return;
            
            // 排除含有大量标点的干扰项（如导航条）
            if ((text.match(/[\/|\\·•]/g) || []).length > 3 && text.length < 20) return;

            block.setAttribute('data-context-lingo-scanned', 'pending');
            this.buffer.push({ block, text });
            this.flush();
        }
        private async flush() {
            if (this.isProcessing || this.buffer.length === 0) return;
            this.isProcessing = true;
            const batch = this.buffer.splice(0, 10);
            const engine = currentEngines.find(e => e.isEnabled);
            if (!engine) { this.isProcessing = false; return; }
            
            for (const item of batch) {
                try {
                    const sentences = splitTextIntoSentences(item.text);
                    const response = await browser.runtime.sendMessage({ action: 'TRANSLATE_TEXT', engine, text: sentences.join(' ||| '), target: 'en' });
                    if (response.success) {
                        const transSentences = response.data.Response.TargetText.split(/\s*\|\|\|\s*/);
                        item.block.setAttribute('data-lingo-source', item.text);
                        item.block.setAttribute('data-lingo-translation', transSentences.join(' '));
                        if (currentAutoTranslate.bilingualMode) {
                            const div = document.createElement('div');
                            div.className = 'context-lingo-bilingual-block';
                            div.innerText = transSentences.join(' ');
                            item.block.after(div);
                        }
                        await applySentenceScopedReplacements(item.block, sentences, transSentences);
                        item.block.setAttribute('data-context-lingo-scanned', 'true');
                    }
                } catch (e) { console.error("Translation Error", e); }
            }
            this.isProcessing = false;
            if (this.buffer.length > 0) this.flush();
        }
    }

    const scheduler = new TranslationScheduler();
    const scan = () => {
        // 定义主体内容的优先容器
        const mainSelectors = ['main', 'article', '#main', '.main', '#content', '.content', '.article', '.post-content'];
        const mainContainer = !currentAutoTranslate.translateWholePage 
            ? document.querySelector(mainSelectors.join(',')) || document.body 
            : document.body;

        const walker = document.createTreeWalker(mainContainer, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (n: any) => {
                const tagName = n.tagName.toUpperCase();
                // 1. 基础剔除标签
                if (['SCRIPT','STYLE','NOSCRIPT','IFRAME','CANVAS','VIDEO','AUDIO','BUTTON','INPUT','TEXTAREA','SELECT', 'CODE', 'PRE'].includes(tagName)) return NodeFilter.FILTER_REJECT;
                
                // 2. 内部 UI 剔除
                // 修复：排除插件生成的双语对照块，防止递归翻译
                if (n.hasAttribute('data-context-lingo-scanned') || 
                    n.closest('[data-context-lingo-container]') ||
                    n.classList?.contains('context-lingo-bilingual-block') ||
                    n.closest('.context-lingo-bilingual-block')
                ) return NodeFilter.FILTER_REJECT;
                
                // 3. 结构性过滤：非全页扫描时剔除干扰容器
                if (!currentAutoTranslate.translateWholePage) {
                    if (['NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(tagName)) return NodeFilter.FILTER_REJECT;
                    // 额外检测 class 和 id 中包含导航词汇的容器
                    const identity = (n.id + n.className).toLowerCase();
                    if (['nav', 'menu', 'sidebar', 'header', 'footer', 'toolbar', 'breadcrumb', 'comment'].some(word => identity.includes(word))) return NodeFilter.FILTER_REJECT;
                    // 排除被以上标签包裹的子孙元素
                    if (n.closest('nav, header, footer, aside')) return NodeFilter.FILTER_REJECT;
                }

                // 4. 接受文本容器标签
                // 重要修复：仅接受“叶子”块级元素。如果容器包含其他块级子元素（如 P, DIV），则跳过父容器，深入子元素。
                // 这能有效防止父容器和子 P 标签同时被识别、翻译和替换，从而导致内容重复。
                const textContainers = ['P','DIV','LI','ARTICLE','SECTION','BLOCKQUOTE','H1','H2','H3','H4','H5','H6', 'TD', 'TH'];
                if (textContainers.includes(tagName)) {
                    const hasBlockChildren = Array.from(n.children).some((c: any) => textContainers.includes(c.tagName));
                    if (hasBlockChildren) {
                        return NodeFilter.FILTER_SKIP; // 跳过当前容器，继续扫描子元素
                    }
                    return NodeFilter.FILTER_ACCEPT; // 它是叶子块级元素，接受并处理
                }

                return NodeFilter.FILTER_SKIP;
            }
        });
        while(walker.nextNode()) scheduler.add(walker.currentNode as HTMLElement);
    };

    const hostname = window.location.hostname;
    if (currentAutoTranslate.blacklist.some(d => hostname.includes(d))) return;
    if (currentAutoTranslate.enabled) {
        setTimeout(scan, 1500);
        const obs = new MutationObserver(() => scan());
        obs.observe(document.body, { childList: true, subtree: true });
    }

    await createShadowRootUi(ctx, {
      name: 'context-lingo-ui',
      position: 'inline',
      onMount: (container) => {
        const wrapper = document.createElement('div');
        wrapper.id = 'context-lingo-app-root';
        container.append(wrapper);
        const root = ReactDOM.createRoot(wrapper);
        root.render(<React.StrictMode><ContentOverlay initialWidgetConfig={currentWidgetConfig} initialEntries={currentEntries} initialInteractionConfig={currentInteractionConfig} initialAutoTranslateConfig={currentAutoTranslate} /></React.StrictMode>);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    }).then(ui => ui.mount());
  },
});

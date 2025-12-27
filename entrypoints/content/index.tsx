
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
    
    // Captured Context
    contextSentence?: string;
    contextSentenceTrans?: string;
    contextParagraph?: string;
    contextParagraphTrans?: string;
    sourceUrl?: string;
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

  // Listen for context updates from the main script (scan results)
  useEffect(() => {
      const handler = (e: CustomEvent) => {
          const foundContexts = e.detail || {};
          
          setPageWords(prev => {
              // Merge foundContexts into existing entries if present, or add if new
              // Note: 'entries' prop contains all user words. 'pageWords' are only those found on page.
              // This logic runs inside ContentOverlay, which receives 'pageWords' updates via this event
              // from the main script execution context (via window event) or directly if we move scan here.
              // Actually, since scan logic is in main(), we need a way to pass data to React.
              // The easiest way is using `setPageWords` inside main() if we can access it, 
              // BUT createShadowRootUi renders independently.
              // So we use a CustomEvent as a bridge.
              
              const newPageWords: WordEntry[] = [];
              const allEntries = entriesRef.current;
              
              Object.keys(foundContexts).forEach(id => {
                  const entry = allEntries.find(e => e.id === id);
                  if (entry) {
                      newPageWords.push({
                          ...entry,
                          ...foundContexts[id] // Merge context
                      });
                  }
              });
              return newPageWords;
          });
      };
      window.addEventListener('context-lingo-update-contexts', handler as EventListener);
      return () => window.removeEventListener('context-lingo-update-contexts', handler as EventListener);
  }, []);

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

  const addBubble = (entry: WordEntry, originalText: string, rect: DOMRect, triggerElement: HTMLElement, context?: { s?: string, st?: string, p?: string, pt?: string, sourceUrl?: string }) => {
      const config = interactionConfigRef.current;
      if (hideTimers.current.has(entry.id)) {
          clearTimeout(hideTimers.current.get(entry.id)!);
          hideTimers.current.delete(entry.id);
      }

      setActiveBubbles(prev => {
          const exists = prev.find(b => b.id === entry.id);
          const newBubble: ActiveBubble = { 
              id: entry.id, 
              entry, 
              originalText, 
              rect, 
              triggerElement,
              contextSentence: context?.s,
              contextSentenceTrans: context?.st,
              contextParagraph: context?.p,
              contextParagraphTrans: context?.pt,
              sourceUrl: context?.sourceUrl
          };

          if (!config.allowMultipleBubbles) {
              return [newBubble];
          } else {
              if (exists) return prev;
              return [...prev, newBubble];
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

  const getCurrentVideoUrl = () => {
      let url = window.location.href;
      try {
          const video = document.querySelector('video');
          if (video && !video.paused) {
              const time = Math.floor(video.currentTime);
              const u = new URL(url);
              if (u.hostname.includes('youtube.com')) {
                  u.searchParams.set('t', `${time}s`);
                  url = u.toString();
              } else if (u.hostname.includes('bilibili.com')) {
                  u.searchParams.set('t', `${time}`);
                  url = u.toString();
              }
          }
      } catch (e) {
          console.warn("Failed to get video timestamp", e);
      }
      return url;
  };

  const extractContext = (entryEl: HTMLElement) => {
      const s = entryEl.getAttribute('data-ctx-s') || '';
      const st = entryEl.getAttribute('data-ctx-st') || '';
      
      let p = '';
      let pt = '';
      const parentBlock = entryEl.closest('[data-lingo-source]');
      if (parentBlock) {
          p = parentBlock.getAttribute('data-lingo-source') || '';
          pt = parentBlock.getAttribute('data-lingo-translation') || '';
      }
      
      const sourceUrl = getCurrentVideoUrl();
      
      return { s, st, p, pt, sourceUrl };
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
                         
                         const context = extractContext(entryEl);

                         showTimer.current = setTimeout(() => {
                            addBubble(entry, originalText, entryEl.getBoundingClientRect(), entryEl, context);
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
                    const context = extractContext(entryEl);
                    addBubble(entry, originalText, entryEl.getBoundingClientRect(), entryEl, context);
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

  const handleUpdateWordCategory = async (id: string, updates: Partial<WordEntry>) => {
      const allEntries = await entriesStorage.getValue();
      const newEntries = allEntries.map(e => e.id === id ? { ...e, ...updates } : e);
      await entriesStorage.setValue(newEntries);
      setEntries(newEntries);
  };
  
  return (
    <div className="reset-shadow-dom" style={{ all: 'initial', fontFamily: 'sans-serif' }}>
       <PageWidget config={widgetConfig} setConfig={(v) => pageWidgetConfigStorage.setValue(v)} pageWords={pageWords} setPageWords={setPageWords} onBatchAddToLearning={(ids) => ids.forEach(id => handleCaptureAndAdd(id))} />
       {activeBubbles.map(bubble => {
           const currentEntry = entries.find(e => e.id === bubble.id) || bubble.entry;
           return (
               <WordBubble 
                    key={bubble.id} 
                    entry={currentEntry} 
                    originalText={bubble.originalText} 
                    targetRect={bubble.rect} 
                    config={interactionConfig} 
                    isVisible={true} 
                    context={{
                        sentence: bubble.contextSentence,
                        sentenceTrans: bubble.contextSentenceTrans,
                        paragraph: bubble.contextParagraph,
                        paragraphTrans: bubble.contextParagraphTrans,
                        sourceUrl: bubble.sourceUrl
                    }}
                    onMouseEnter={() => handleBubbleMouseEnter(bubble.id)} 
                    onMouseLeave={() => scheduleRemoveBubble(bubble.id)} 
                    onUpdateCategory={handleUpdateWordCategory}
                    ttsSpeed={autoTranslateConfig.ttsSpeed} 
                />
           );
       })}
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
        let allPotentialReplacements: { 
            start: number, 
            end: number, 
            entry: WordEntry, 
            matchedWord: string,
            sourceSentence: string,
            transSentence: string
        }[] = [];
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
                    allPotentialReplacements.push({ 
                        start: sentStart + localPos, 
                        end: sentStart + localPos + m.text.length, 
                        entry: m.entry, 
                        matchedWord: m.matchedWord,
                        sourceSentence: sent,
                        transSentence: trans
                    });
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
                                allPotentialReplacements.push({ 
                                    start: sentStart + localPos, 
                                    end: sentStart + localPos + m.text.length, 
                                    entry: m.entry, 
                                    matchedWord: m.matchedWord,
                                    sourceSentence: sent,
                                    transSentence: trans
                                });
                                localPos = sent.indexOf(m.text, localPos + 1);
                            }
                        });
                    }
                }
            }
        }

        // 2. Apply Density Filtering Logic
        const categorizedReplacements: Record<WordCategory, typeof allPotentialReplacements> = {} as any;
        Object.values(WordCategory).forEach(cat => categorizedReplacements[cat] = []);
        
        allPotentialReplacements.forEach(r => {
            if (categorizedReplacements[r.entry.category]) {
                categorizedReplacements[r.entry.category].push(r);
            }
        });

        const finalFilteredReplacements: typeof allPotentialReplacements = [];

        for (const cat of Object.values(WordCategory)) {
            const matches = categorizedReplacements[cat];
            if (matches.length === 0) continue;

            const styleConfig = currentStyles[cat];
            let limit = matches.length; 

            if (styleConfig) {
                if (styleConfig.densityMode === 'count') {
                    limit = styleConfig.densityValue;
                } else if (styleConfig.densityMode === 'percent') {
                    limit = Math.ceil(matches.length * (styleConfig.densityValue / 100));
                }
            }
            matches.sort((a, b) => a.start - b.start);
            finalFilteredReplacements.push(...matches.slice(0, limit));
        }

        // Dispatch found context to React
        const foundContexts: Record<string, Partial<WordEntry>> = {};
        finalFilteredReplacements.forEach(r => {
            foundContexts[r.entry.id] = {
                contextSentence: r.sourceSentence,
                contextSentenceTranslation: r.transSentence,
                // Assuming block is paragraph level roughly
                contextParagraph: block.innerText, 
                // We don't have full paragraph translation easily without re-joining, approximate:
                contextParagraphTranslation: transSentences.join(' '),
                sourceUrl: window.location.href
            };
        });
        window.dispatchEvent(new CustomEvent('context-lingo-update-contexts', { detail: foundContexts }));

        // 3. Apply Replacements to DOM
        finalFilteredReplacements.sort((a, b) => a.start - b.start);
        const nonOverlappingReplacements: typeof finalFilteredReplacements = [];
        let occupiedEnd = -1;
        for (const r of finalFilteredReplacements) {
            if (r.start >= occupiedEnd) {
                nonOverlappingReplacements.push(r);
                occupiedEnd = r.end;
            }
        }

        nonOverlappingReplacements.sort((a, b) => b.start - a.start); 

        let lastStart = Number.MAX_VALUE;
        let lastEntry: WordEntry | null = null;

        nonOverlappingReplacements.forEach(r => {
            let addSpace = false;
            if (lastEntry && r.end === lastStart) {
                addSpace = true;
            }

            if (r.end <= lastStart) {
                const target = nodeMap.find(n => r.start >= n.start && r.end <= n.end);
                if (target) {
                    const { node, start } = target;
                    const val = node.nodeValue || "";
                    const localStart = r.start - start;
                    const localEnd = r.end - start;

                    if (localStart >= 0 && localEnd <= val.length) {
                        const mid = val.substring(localStart, localEnd);
                        const after = val.substring(localEnd);
                        const before = val.substring(0, localStart);

                        const span = document.createElement('span');
                        span.className = 'context-lingo-word';
                        span.innerHTML = buildReplacementHtml(
                            mid, 
                            r.matchedWord, 
                            r.entry.category, 
                            currentStyles, 
                            currentOriginalTextConfig, 
                            r.entry.id,
                            r.sourceSentence,
                            r.transSentence
                        );

                        if (after) {
                            node.parentNode?.insertBefore(document.createTextNode(after), node.nextSibling);
                        }
                        if (addSpace) {
                            node.parentNode?.insertBefore(document.createTextNode(" "), node.nextSibling);
                        }
                        node.parentNode?.insertBefore(span, node.nextSibling);
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
            if (!text || text.length < 5 || !/[\u4e00-\u9fa5]/.test(text)) return;
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
            
            // Even if no engine, we still process replacements based on original text if we assume translation matches
            // OR simply skip translation part. For now, strict check:
            // Actually, we can do replacement without translation engine if words match exactly.
            // But logic relies on `findFuzzyMatches` using translation. 
            // If no engine, we pass empty translation.
            
            for (const item of batch) {
                try {
                    const sentences = splitTextIntoSentences(item.text);
                    let transSentences: string[] = [];
                    
                    if (engine) {
                        const response = await browser.runtime.sendMessage({ action: 'TRANSLATE_TEXT', engine, text: sentences.join(' ||| '), target: 'en' });
                        if (response.success) {
                            transSentences = response.data.Response.TargetText.split(/\s*\|\|\|\s*/);
                        }
                    } else {
                        // No engine fallback: empty translations
                        transSentences = sentences.map(() => ""); 
                    }

                    // Store Full Paragraph Context
                    item.block.setAttribute('data-lingo-source', item.text);
                    item.block.setAttribute('data-lingo-translation', transSentences.join(' '));
                    
                    if (currentAutoTranslate.bilingualMode && transSentences.length > 0 && transSentences[0] !== "") {
                        const div = document.createElement('div');
                        div.className = 'context-lingo-bilingual-block';
                        div.innerText = transSentences.join(' ');
                        item.block.after(div);
                    }
                    await applySentenceScopedReplacements(item.block, sentences, transSentences);
                    item.block.setAttribute('data-context-lingo-scanned', 'true');
                } catch (e) { console.error("Translation/Replacement Error", e); }
            }
            this.isProcessing = false;
            if (this.buffer.length > 0) this.flush();
        }
    }

    const scheduler = new TranslationScheduler();
    const scan = () => {
        const mainSelectors = ['main', 'article', '#main', '.main', '#content', '.content', '.article', '.post-content'];
        const mainContainer = !currentAutoTranslate.translateWholePage 
            ? document.querySelector(mainSelectors.join(',')) || document.body 
            : document.body;

        const walker = document.createTreeWalker(mainContainer, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (n: any) => {
                const tagName = n.tagName.toUpperCase();
                if (['SCRIPT','STYLE','NOSCRIPT','IFRAME','CANVAS','VIDEO','AUDIO','BUTTON','INPUT','TEXTAREA','SELECT', 'CODE', 'PRE'].includes(tagName)) return NodeFilter.FILTER_REJECT;
                
                if (n.hasAttribute('data-context-lingo-scanned') || 
                    n.closest('[data-context-lingo-container]') ||
                    n.classList?.contains('context-lingo-bilingual-block') ||
                    n.closest('.context-lingo-bilingual-block')
                ) return NodeFilter.FILTER_REJECT;
                
                if (!currentAutoTranslate.translateWholePage) {
                    if (['NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(tagName)) return NodeFilter.FILTER_REJECT;
                    const identity = (n.id + n.className).toLowerCase();
                    if (['nav', 'menu', 'sidebar', 'header', 'footer', 'toolbar', 'breadcrumb', 'comment'].some(word => identity.includes(word))) return NodeFilter.FILTER_REJECT;
                    if (n.closest('nav, header, footer, aside')) return NodeFilter.FILTER_REJECT;
                }

                const textContainers = ['P','DIV','LI','ARTICLE','SECTION','BLOCKQUOTE','H1','H2','H3','H4','H5','H6', 'TD', 'TH'];
                if (textContainers.includes(tagName)) {
                    const hasBlockChildren = Array.from(n.children).some((c: any) => textContainers.includes(c.tagName));
                    if (hasBlockChildren) {
                        return NodeFilter.FILTER_SKIP;
                    }
                    return NodeFilter.FILTER_ACCEPT;
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

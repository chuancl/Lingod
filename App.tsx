
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { WordManager } from './components/WordManager';
import { VisualStylesSection } from './components/StyleEditor';
import { ScenariosSection, EnginesSection, InteractionSection, AnkiSection, PageWidgetSection, GeneralSection, ConfigManagementSection } from './components/Settings';
import { PreviewSection } from './components/settings/PreviewSection'; 
import { WordDetail } from './components/WordDetail'; 
import { Loader2 } from 'lucide-react';
import { AppView, SettingSectionId, Scenario, WordEntry, PageWidgetConfig, WordInteractionConfig, TranslationEngine, AnkiConfig, AutoTranslateConfig, StyleConfig, WordCategory, OriginalTextConfig, DictionaryEngine, WordTab } from './types';
import { DEFAULT_STYLES, DEFAULT_ORIGINAL_TEXT_CONFIG, DEFAULT_WORD_INTERACTION, DEFAULT_PAGE_WIDGET, INITIAL_ENGINES, DEFAULT_ANKI_CONFIG, DEFAULT_AUTO_TRANSLATE, INITIAL_SCENARIOS, INITIAL_DICTIONARIES, DEFAULT_STYLE } from './constants';
import { entriesStorage, scenariosStorage, pageWidgetConfigStorage, autoTranslateConfigStorage, enginesStorage, ankiConfigStorage, seedInitialData, stylesStorage, originalTextConfigStorage, interactionConfigStorage, dictionariesStorage } from './utils/storage';
import { preloadVoices } from './utils/audio';

// --- Utility: Deep Merge for Config ---
// Ensures that `source` merges into `target`.
// - If `source` (imported) lacks a key, `target` (default) value is kept.
// - Arrays are replaced if source is an array, otherwise default is kept.
const deepMergeConfig = (defaultConfig: any, importedConfig: any): any => {
    if (importedConfig === undefined || importedConfig === null) {
        return defaultConfig;
    }

    // If types mismatch (e.g. default is array, imported is object), revert to default
    if (Array.isArray(defaultConfig) !== Array.isArray(importedConfig)) {
        return defaultConfig;
    }

    if (Array.isArray(defaultConfig)) {
        // For arrays, if imported has data, use it. Otherwise keep default (if that's desired behavior)
        // OR better for config: if imported is empty array, it might mean user cleared it. 
        // But for safety against bad parse, let's use imported only if it's an array.
        return importedConfig; 
    }

    if (typeof defaultConfig === 'object' && defaultConfig !== null) {
        const result: any = { ...defaultConfig };
        Object.keys(defaultConfig).forEach(key => {
            const defVal = defaultConfig[key];
            const impVal = importedConfig[key];

            if (typeof defVal === 'object' && defVal !== null && !Array.isArray(defVal)) {
                // Recursively merge nested objects
                result[key] = deepMergeConfig(defVal, impVal);
            } else if (impVal !== undefined) {
                // Primitive values: Use imported if present
                result[key] = impVal;
            }
        });
        // Keep keys that are in imported but not in default (custom fields)
        if (importedConfig) {
             Object.keys(importedConfig).forEach(key => {
                 if (result[key] === undefined) result[key] = importedConfig[key];
             });
        }
        return result;
    }

    return importedConfig !== undefined ? importedConfig : defaultConfig;
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [activeSettingSection, setActiveSettingSection] = useState<SettingSectionId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailWord, setDetailWord] = useState<string>(''); 
  
  const [initialManagerTab, setInitialManagerTab] = useState<WordTab | undefined>(undefined);
  const [initialManagerSearch, setInitialManagerSearch] = useState<string>('');

  // --- Persistent State ---
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [pageWidgetConfig, setPageWidgetConfig] = useState<PageWidgetConfig>(DEFAULT_PAGE_WIDGET);
  const [autoTranslate, setAutoTranslate] = useState<AutoTranslateConfig>(DEFAULT_AUTO_TRANSLATE);
  const [engines, setEngines] = useState<TranslationEngine[]>(INITIAL_ENGINES);
  const [dictionaries, setDictionaries] = useState<DictionaryEngine[]>(INITIAL_DICTIONARIES);
  const [ankiConfig, setAnkiConfig] = useState<AnkiConfig>(DEFAULT_ANKI_CONFIG);
  const [styles, setStyles] = useState<Record<WordCategory, StyleConfig>>(DEFAULT_STYLES);
  const [originalTextConfig, setOriginalTextConfig] = useState<OriginalTextConfig>(DEFAULT_ORIGINAL_TEXT_CONFIG);
  const [interactionConfig, setInteractionConfig] = useState<WordInteractionConfig>(DEFAULT_WORD_INTERACTION);

  useEffect(() => {
    preloadVoices(); 
    
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const wordParam = params.get('word');
    const tabParam = params.get('tab');
    const searchParam = params.get('search');

    if (viewParam === 'word-detail' && wordParam) {
        setDetailWord(wordParam);
        setCurrentView('word-detail');
    } else if (viewParam === 'words') {
        setCurrentView('words');
        if (tabParam) setInitialManagerTab(tabParam as WordTab);
        if (searchParam) setInitialManagerSearch(searchParam);
    }

    const loadData = async () => {
      await seedInitialData();
      
      const currentDicts = await dictionariesStorage.getValue();
      // Migration logic for dictionaries
      const iciba = currentDicts.find(d => d.id === 'iciba');
      let finalDictionaries = currentDicts;
      if (iciba && iciba.priority !== 1) {
          finalDictionaries = currentDicts.map(d => {
              if (d.id === 'iciba') return { ...d, priority: 1 };
              if (d.id === 'youdao') return { ...d, priority: 2 };
              return d;
          });
          await dictionariesStorage.setValue(finalDictionaries);
      }
      setDictionaries(finalDictionaries);

      const [s, e, p, a, eng, ank, sty, orig, interact] = await Promise.all([
        scenariosStorage.getValue(),
        entriesStorage.getValue(),
        pageWidgetConfigStorage.getValue(),
        autoTranslateConfigStorage.getValue(),
        enginesStorage.getValue(),
        ankiConfigStorage.getValue(),
        stylesStorage.getValue(),
        originalTextConfigStorage.getValue(),
        interactionConfigStorage.getValue(),
      ]);
      
      // Apply Deep Merge on initial load to ensure structure integrity against old data
      setScenarios(Array.isArray(s) ? s : INITIAL_SCENARIOS);
      setEntries(Array.isArray(e) ? e : []);
      setPageWidgetConfig(deepMergeConfig(DEFAULT_PAGE_WIDGET, p));
      setAutoTranslate(deepMergeConfig(DEFAULT_AUTO_TRANSLATE, a));
      setEngines(Array.isArray(eng) ? eng : INITIAL_ENGINES);
      setAnkiConfig(deepMergeConfig(DEFAULT_ANKI_CONFIG, ank));
      
      const migratedStyles = { ...DEFAULT_STYLES };
      if (sty) {
          Object.keys(sty).forEach(key => {
              const category = key as WordCategory;
              migratedStyles[category] = deepMergeConfig(DEFAULT_STYLE, sty[category]);
          });
      }
      setStyles(migratedStyles);
      
      setOriginalTextConfig(deepMergeConfig(DEFAULT_ORIGINAL_TEXT_CONFIG, orig));
      setInteractionConfig(deepMergeConfig(DEFAULT_WORD_INTERACTION, interact));
      
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Auto-save
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
        Promise.all([
            entriesStorage.setValue(entries),
            scenariosStorage.setValue(scenarios),
            pageWidgetConfigStorage.setValue(pageWidgetConfig),
            autoTranslateConfigStorage.setValue(autoTranslate),
            enginesStorage.setValue(engines),
            dictionariesStorage.setValue(dictionaries),
            ankiConfigStorage.setValue(ankiConfig),
            stylesStorage.setValue(styles),
            originalTextConfigStorage.setValue(originalTextConfig),
            interactionConfigStorage.setValue(interactionConfig),
        ]).catch(err => console.error("Auto-save failed:", err));
    }, 800);
    return () => clearTimeout(timer);
  }, [entries, scenarios, pageWidgetConfig, autoTranslate, engines, dictionaries, ankiConfig, styles, originalTextConfig, interactionConfig, isLoading]);

  const scrollToSetting = (id: SettingSectionId) => {
    setCurrentView('settings');
    setActiveSettingSection(id);
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        const yOffset = -30; 
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 100);
  };

  const handleOpenWordDetail = (word: string) => {
      setDetailWord(word);
      setCurrentView('word-detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Configuration Import Logic ---
  const handleConfigImport = async (newConfig: any) => {
      // Use deepMergeConfig to robustly merge imported data with defaults
      // This prevents 'undefined' errors if the import file is partial or malformed
      
      const nextAutoTranslate = deepMergeConfig(DEFAULT_AUTO_TRANSLATE, newConfig.general);
      const nextInteraction = deepMergeConfig(DEFAULT_WORD_INTERACTION, newConfig.interaction);
      const nextPageWidget = deepMergeConfig(DEFAULT_PAGE_WIDGET, newConfig.pageWidget);
      const nextAnki = deepMergeConfig(DEFAULT_ANKI_CONFIG, newConfig.anki);
      
      // For Arrays, checks if valid array in import, else falls back to existing state (not default, to preserve user data if import fails specific section)
      // Actually, for full config restore, we probably want to overwrite.
      const nextScenarios = (Array.isArray(newConfig.scenarios)) ? newConfig.scenarios : scenarios;
      const nextEngines = (Array.isArray(newConfig.engines)) ? newConfig.engines : engines;

      // Styles
      const nextStyles = { ...DEFAULT_STYLES };
      if (newConfig.styles) {
          Object.keys(newConfig.styles).forEach(key => {
              const cat = key as WordCategory;
              nextStyles[cat] = deepMergeConfig(DEFAULT_STYLE, newConfig.styles[cat]);
          });
      }

      // Update State
      setAutoTranslate(nextAutoTranslate);
      setInteractionConfig(nextInteraction);
      setPageWidgetConfig(nextPageWidget);
      setAnkiConfig(nextAnki);
      setScenarios(nextScenarios);
      setEngines(nextEngines);
      setStyles(nextStyles);

      // Force Save immediately to disk
      await Promise.all([
          autoTranslateConfigStorage.setValue(nextAutoTranslate),
          interactionConfigStorage.setValue(nextInteraction),
          pageWidgetConfigStorage.setValue(nextPageWidget),
          ankiConfigStorage.setValue(nextAnki),
          scenariosStorage.setValue(nextScenarios),
          enginesStorage.setValue(nextEngines),
          stylesStorage.setValue(nextStyles)
      ]);
  };

  const currentConfigs = {
      general: autoTranslate,
      styles: styles,
      scenarios: scenarios,
      interaction: interactionConfig,
      pageWidget: pageWidgetConfig,
      engines: engines,
      anki: ankiConfig
  };

  if (isLoading && entries.length === 0) {
    return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 text-blue-600 animate-spin"/></div>;
  }

  if (currentView === 'word-detail') {
      return (
          <WordDetail 
             word={detailWord} 
             onBack={() => {
                 if (window.history.length > 1) {
                     setCurrentView('dashboard');
                 } else {
                     setCurrentView('dashboard');
                 }
             }} 
          />
      );
  }

  return (
    <div className="flex min-h-screen bg-slate-100/50 font-sans text-slate-900">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView}
        onSettingScroll={scrollToSetting}
        activeSettingSection={activeSettingSection}
      />

      <main className="flex-1 ml-64 p-8 pb-32">
        <div className="max-w-6xl mx-auto">
          
          {currentView === 'dashboard' && (
             <div className="animate-in fade-in duration-300">
               <Dashboard entries={entries} scenarios={scenarios} />
             </div>
          )}

          {currentView === 'words' && (
             <div className="animate-in fade-in duration-300">
               <WordManager 
                  scenarios={scenarios} 
                  entries={entries} 
                  setEntries={setEntries} 
                  ttsSpeed={autoTranslate.ttsSpeed || 1.0}
                  initialTab={initialManagerTab}
                  initialSearchQuery={initialManagerSearch}
                  onOpenDetail={handleOpenWordDetail} 
               />
             </div>
          )}

          {currentView === 'settings' && (
             <div className="space-y-12 animate-in fade-in duration-300">
                <section id="general" className="scroll-mt-8">
                  <GeneralSection config={autoTranslate} setConfig={setAutoTranslate} />
                </section>

                <section id="visual-styles" className="scroll-mt-8">
                  <VisualStylesSection 
                    styles={styles} 
                    onStylesChange={setStyles} 
                    originalTextConfig={originalTextConfig}
                    onOriginalTextConfigChange={setOriginalTextConfig}
                  />
                </section>

                <section id="scenarios" className="scroll-mt-8">
                  <ScenariosSection scenarios={scenarios} setScenarios={setScenarios} />
                </section>
                
                <section id="word-bubble" className="scroll-mt-8">
                  <InteractionSection config={interactionConfig} setConfig={setInteractionConfig} />
                </section>

                <section id="page-widget" className="scroll-mt-8">
                   <PageWidgetSection widget={pageWidgetConfig} setWidget={setPageWidgetConfig} onOpenDetail={handleOpenWordDetail} />
                </section>

                <section id="engines" className="scroll-mt-8">
                  <EnginesSection engines={engines} setEngines={setEngines} dictionaries={dictionaries} />
                </section>

                <section id="preview" className="scroll-mt-8">
                   <PreviewSection 
                      engines={engines} 
                      entries={entries} 
                      styles={styles} 
                      originalTextConfig={originalTextConfig} 
                      autoTranslateConfig={autoTranslate}
                   />
                </section>

                <section id="anki" className="scroll-mt-8">
                  <AnkiSection config={ankiConfig} setConfig={setAnkiConfig} entries={entries} setEntries={setEntries} />
                </section>

                <section id="config-management" className="scroll-mt-8">
                  <ConfigManagementSection currentConfigs={currentConfigs} onImport={handleConfigImport} />
                </section>
             </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;

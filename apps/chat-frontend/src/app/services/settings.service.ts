import { Injectable, signal, effect } from '@angular/core';
import { PromptTemplate } from '../models/types';

const SETTINGS_KEY = 'chat-settings';

interface SettingsData {
  defaultModel: string;
  temperature: number;
  darkMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
  enabledTools: string[];
  disabledTools: string[];
  globalSystemPrompt: string;
  promptTemplates: PromptTemplate[];
}

const DEFAULTS: SettingsData = {
  defaultModel: '',
  temperature: 0.7,
  darkMode: true,
  fontSize: 'medium',
  enabledTools: [],
  disabledTools: [],
  globalSystemPrompt: '',
  promptTemplates: [],
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly data = this.loadFromStorage();

  readonly defaultModel = signal(this.data.defaultModel);
  readonly temperature = signal(this.data.temperature);
  readonly darkMode = signal(this.data.darkMode);
  readonly fontSize = signal(this.data.fontSize);
  readonly enabledTools = signal(this.data.enabledTools);
  readonly disabledTools = signal(this.data.disabledTools);
  readonly globalSystemPrompt = signal(this.data.globalSystemPrompt);
  readonly promptTemplates = signal(this.data.promptTemplates);

  constructor() {
    // Apply dark mode on init
    this.applyDarkMode(this.data.darkMode);
    this.applyFontSize(this.data.fontSize);

    // Persist all settings to localStorage whenever any signal changes
    effect(() => {
      const settings: SettingsData = {
        defaultModel: this.defaultModel(),
        temperature: this.temperature(),
        darkMode: this.darkMode(),
        fontSize: this.fontSize(),
        enabledTools: this.enabledTools(),
        disabledTools: this.disabledTools(),
        globalSystemPrompt: this.globalSystemPrompt(),
        promptTemplates: this.promptTemplates(),
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    });

    // React to dark mode changes
    effect(() => {
      this.applyDarkMode(this.darkMode());
    });

    // React to font size changes
    effect(() => {
      this.applyFontSize(this.fontSize());
    });
  }

  private applyDarkMode(dark: boolean): void {
    if (dark) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  private applyFontSize(size: 'small' | 'medium' | 'large'): void {
    document.documentElement.setAttribute('data-font-size', size);
  }

  private loadFromStorage(): SettingsData {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULTS;
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return DEFAULTS;
    }
  }
}

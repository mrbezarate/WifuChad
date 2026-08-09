export class DoorkeeperFilter {
  private filter: Set<string>;
  private frequencies: Map<string, number>;
  private accessCount: number;
  private readonly sampleWindow: number;

  constructor(sampleWindow: number = 100) {
    this.filter = new Set<string>();
    this.frequencies = new Map<string, number>();
    this.accessCount = 0;
    this.sampleWindow = sampleWindow;
  }

  // Хэширование факта для нормализации сравнения
  private normalizeFact(fact: string): string {
    return fact.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
  }

  // Оценка допуска факта
  public shouldAdmit(fact: string): boolean {
    const norm = this.normalizeFact(fact);
    this.accessCount++;

    if (this.accessCount >= this.sampleWindow) {
      this.reset();
    }

    if (!this.filter.has(norm)) {
      // Первый раз видим факт — заносим в Doorkeeper, но в долгосрочную память не пускаем
      this.filter.add(norm);
      this.frequencies.set(norm, 1);
      return false; 
    }

    // Повторное появление — наращиваем частоту
    const freq = (this.frequencies.get(norm) || 0) + 1;
    this.frequencies.set(norm, freq);

    // Допускаем только если частота выше порога (например, упомянут минимум 2 раза)
    return freq >= 2;
  }

  // Механизм старения (Aging) — деление частот на 2
  private reset(): void {
    this.accessCount = 0;
    this.filter.clear();
    for (const [key, value] of this.frequencies.entries()) {
      const halved = Math.floor(value / 2);
      if (halved <= 0) {
        this.frequencies.delete(key);
      } else {
        this.frequencies.set(key, halved);
        this.filter.add(key); // Выжившие остаются в Doorkeeper
      }
    }
  }
}

interface BBRContextConfig {
  maxTotalTokens: number;     // Физический предел внимания (например, 8000 токенов)
  pacingGain: number;         // 2.77 (из BBRv3 для плавного старта)
  cwndGain: number;           // 2.0 (для контроля объема)
}

export function paceMemoryContext(
  allMemories: string[], 
  chatHistoryLength: number, 
  config: BBRContextConfig = { maxTotalTokens: 4000, pacingGain: 2.77, cwndGain: 2.0 }
): string[] {
  // Рассчитываем текущее "заполнение" канала связи историей чата
  const estimatedHistoryTokens = chatHistoryLength * 80; // Эвристика: ~80 токенов на сообщение
  const availableBufferWidth = config.maxTotalTokens - estimatedHistoryTokens;

  if (availableBufferWidth <= 0) {
    return []; // Канал забит историей, блокируем подмешивание старой памяти для избежания потери фокуса
  }

  // Рассчитываем оптимальное окно отправки фактов (Congestion Window equivalent)
  const targetFactCount = Math.floor(
    (availableBufferWidth / 150) * (config.cwndGain / config.pacingGain) // ~150 токенов на 1 факт
  );

  // Возвращаем строго урезанный и отсортированный по важности (recency/affinity) массив фактов
  return allMemories.slice(0, Math.max(1, targetFactCount));
}

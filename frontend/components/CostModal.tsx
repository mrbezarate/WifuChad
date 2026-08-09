import React from 'react';
import { X, Coins } from 'lucide-react';

interface CostModalProps {
    isOpen: boolean;
    onClose: () => void;
    language: 'ru' | 'en';
}

export const CostModal: React.FC<CostModalProps> = ({ isOpen, onClose, language }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-pink-100 transform transition-all">
                <div className="p-4 border-b border-pink-100 flex items-center justify-between bg-pink-50/50">
                    <div className="flex items-center gap-2 font-bold text-kawaii-600">
                        <Coins size={20} />
                        <span>{language === 'ru' ? 'О стоимости и токенах' : 'About Cost & Tokens'}</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4 text-sm text-slate-700">
                    {language === 'ru' ? (
                        <>
                            <p><strong>Ответ на ваш вопрос:</strong> Нет, это совсем не дорого!</p>
                            <p>В приложении используется модель <strong>Gemini 2.5 Flash</strong>. Это очень быстрая и экономичная модель.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Цена:</strong> ~$0.075 за 1 млн токенов на вход и ~$0.30 за 1 млн на выход.</li>
                                <li><strong>Экономия:</strong> Девочки настроены отвечать очень коротко (1-2 предложения). Это значит, что контекст растет медленно, и токены почти не тратятся.</li>
                                <li><strong>Память:</strong> Функция памяти запускается каждые 4 сообщения и анализирует только последние 8 сообщений. Это потребляет минимум токенов.</li>
                            </ul>
                            <p className="font-semibold text-kawaii-600 bg-pink-50 p-3 rounded-xl border border-pink-100">
                                Итог: Тысячи сообщений обойдутся вам буквально в пару центов. Вы можете общаться спокойно!
                            </p>
                        </>
                    ) : (
                        <>
                            <p><strong>Answer to your question:</strong> No, it is not expensive at all!</p>
                            <p>This app uses the <strong>Gemini 2.5 Flash</strong> model, which is highly optimized and cost-effective.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Cost:</strong> ~$0.075 per 1M input tokens and ~$0.30 per 1M output tokens.</li>
                                <li><strong>Optimization:</strong> The waifus are strictly instructed to send short, text-like messages (1-2 sentences). This keeps the context window very small.</li>
                                <li><strong>Memory:</strong> The memory extraction runs every 4 messages and only looks at the last 8 messages, using very few tokens.</li>
                            </ul>
                            <p className="font-semibold text-kawaii-600 bg-pink-50 p-3 rounded-xl border border-pink-100">
                                Conclusion: Thousands of messages will literally cost you a few cents. Chat without worries!
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * Interface translation.
 *
 * Scope is deliberate and worth stating: this covers the app's *chrome* —
 * navigation, settings, forum and profile labels. The prompt catalog itself
 * (111 prompts and their bodies) stays in English, because a machine-translated
 * prompt is a worse prompt, and prompts are the product. Translating those is a
 * content project, not a code one.
 *
 * Missing keys fall back to English rather than showing a raw key.
 */

import type { LanguageCode } from "./settingsStore";

export const LANGUAGES: { code: LanguageCode; label: string; english: string }[] = [
  { code: "en", label: "English", english: "English" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "ja", label: "日本語", english: "Japanese" },
  { code: "zh", label: "简体中文", english: "Chinese (Simplified)" },
];

const en = {
  "nav.discover": "Discover",
  "nav.library": "Library",
  "nav.studio": "Prompt Studio",
  "nav.forum": "Forum",
  "nav.settings": "Settings",
  "nav.export": "Export",
  "nav.import": "Import",
  "nav.signOut": "Sign out",
  "nav.skipToContent": "Skip to main content",

  "settings.title": "Settings",
  "settings.subtitle": "Preferences are saved on this device.",
  "settings.accessibility": "Accessibility",
  "settings.accessibilityNote":
    "Prompt Lab uses semantic headings, labelled controls and keyboard-reachable buttons, so screen readers can navigate it. These options help if you need larger text, stronger contrast or less movement.",
  "settings.textSize": "Text size",
  "settings.textSizeNote": "Scales the whole interface, not just body text.",
  "settings.size.default": "Default",
  "settings.size.large": "Large",
  "settings.size.xlarge": "Largest",
  "settings.contrast": "Contrast",
  "settings.contrastNote": "Brightens text and strengthens borders.",
  "settings.contrast.default": "Default",
  "settings.contrast.high": "High contrast",
  "settings.motion": "Motion",
  "settings.motionNote": "Removes transitions and smooth scrolling.",
  "settings.motion.default": "Default",
  "settings.motion.reduced": "Reduce motion",
  "settings.font": "Typeface",
  "settings.fontNote": "A wider, more distinct typeface can be easier to read.",
  "settings.font.default": "Default",
  "settings.font.dyslexic": "Easier reading",
  "settings.focusRing": "Strong focus outline",
  "settings.focusRingNote": "Makes the keyboard position obvious.",
  "settings.underlineLinks": "Always underline links",
  "settings.underlineLinksNote": "Does not rely on colour alone.",

  "settings.language": "Language",
  "settings.languageNote":
    "Translates the interface. Prompts in the catalog stay in English.",

  "settings.general": "General",
  "settings.confirmDestructive": "Confirm before deleting",
  "settings.confirmDestructiveNote": "Ask before removing a prompt or agent.",

  "settings.data": "Your data",
  "settings.dataNote":
    "Your library, conversations and preferences live in this browser. Export keeps a copy.",
  "settings.export": "Export library",
  "settings.import": "Import library",
  "settings.reset": "Reset preferences",
  "settings.resetDone": "Preferences reset to defaults.",

  "forum.title": "Forum",
  "forum.myPrompts": "My prompts",
  "forum.backToForum": "Back to forum",
  "forum.public": "Public",
  "forum.private": "Private",
  "forum.publish": "Publish to forum",
  "forum.publishAnon": "Publish anonymously",
  "forum.savePrivately": "Save privately",
  "forum.empty": "No published prompts yet.",

  "profile.yours": "Your profile",
  "profile.author": "Author profile",
  "profile.publicPrompts": "Public prompts",
  "profile.private": "Private",
  "profile.joined": "Joined",
  "profile.displayName": "Your display name",
  "profile.yourPrompts": "Your prompts",
  "profile.save": "Save",
  "profile.anonymous": "Anonymous",
} as const;

export type TranslationKey = keyof typeof en;

type Dictionary = Partial<Record<TranslationKey, string>>;

const es: Dictionary = {
  "nav.discover": "Descubrir",
  "nav.library": "Biblioteca",
  "nav.studio": "Estudio de prompts",
  "nav.forum": "Foro",
  "nav.settings": "Ajustes",
  "nav.export": "Exportar",
  "nav.import": "Importar",
  "nav.signOut": "Cerrar sesión",
  "nav.skipToContent": "Saltar al contenido principal",

  "settings.title": "Ajustes",
  "settings.subtitle": "Las preferencias se guardan en este dispositivo.",
  "settings.accessibility": "Accesibilidad",
  "settings.accessibilityNote":
    "Prompt Lab usa encabezados semánticos, controles etiquetados y botones accesibles por teclado, para que los lectores de pantalla puedan navegarlo. Estas opciones ayudan si necesitas texto más grande, más contraste o menos movimiento.",
  "settings.textSize": "Tamaño del texto",
  "settings.textSizeNote": "Escala toda la interfaz, no solo el texto.",
  "settings.size.default": "Predeterminado",
  "settings.size.large": "Grande",
  "settings.size.xlarge": "Máximo",
  "settings.contrast": "Contraste",
  "settings.contrastNote": "Aclara el texto y refuerza los bordes.",
  "settings.contrast.default": "Predeterminado",
  "settings.contrast.high": "Alto contraste",
  "settings.motion": "Movimiento",
  "settings.motionNote": "Elimina transiciones y desplazamiento suave.",
  "settings.motion.default": "Predeterminado",
  "settings.motion.reduced": "Reducir movimiento",
  "settings.font": "Tipografía",
  "settings.fontNote": "Una tipografía más ancha puede ser más fácil de leer.",
  "settings.font.default": "Predeterminada",
  "settings.font.dyslexic": "Lectura más fácil",
  "settings.focusRing": "Contorno de foco marcado",
  "settings.focusRingNote": "Hace evidente la posición del teclado.",
  "settings.underlineLinks": "Subrayar siempre los enlaces",
  "settings.underlineLinksNote": "No depende solo del color.",

  "settings.language": "Idioma",
  "settings.languageNote":
    "Traduce la interfaz. Los prompts del catálogo permanecen en inglés.",

  "settings.general": "General",
  "settings.confirmDestructive": "Confirmar antes de eliminar",
  "settings.confirmDestructiveNote": "Preguntar antes de borrar un prompt o agente.",

  "settings.data": "Tus datos",
  "settings.dataNote":
    "Tu biblioteca, conversaciones y preferencias están en este navegador. Exportar guarda una copia.",
  "settings.export": "Exportar biblioteca",
  "settings.import": "Importar biblioteca",
  "settings.reset": "Restablecer preferencias",
  "settings.resetDone": "Preferencias restablecidas.",

  "forum.title": "Foro",
  "forum.myPrompts": "Mis prompts",
  "forum.backToForum": "Volver al foro",
  "forum.public": "Público",
  "forum.private": "Privado",
  "forum.publish": "Publicar en el foro",
  "forum.publishAnon": "Publicar de forma anónima",
  "forum.savePrivately": "Guardar en privado",
  "forum.empty": "Todavía no hay prompts publicados.",

  "profile.yours": "Tu perfil",
  "profile.author": "Perfil del autor",
  "profile.publicPrompts": "Prompts públicos",
  "profile.private": "Privados",
  "profile.joined": "Se unió el",
  "profile.displayName": "Tu nombre visible",
  "profile.yourPrompts": "Tus prompts",
  "profile.save": "Guardar",
  "profile.anonymous": "Anónimo",
};

const ja: Dictionary = {
  "nav.discover": "見つける",
  "nav.library": "ライブラリ",
  "nav.studio": "プロンプトスタジオ",
  "nav.forum": "フォーラム",
  "nav.settings": "設定",
  "nav.export": "書き出し",
  "nav.import": "読み込み",
  "nav.signOut": "サインアウト",
  "nav.skipToContent": "本文へスキップ",

  "settings.title": "設定",
  "settings.subtitle": "設定はこの端末に保存されます。",
  "settings.accessibility": "アクセシビリティ",
  "settings.accessibilityNote":
    "Prompt Lab は見出し構造、ラベル付きのコントロール、キーボード操作できるボタンを使用しており、スクリーンリーダーで操作できます。以下は文字を大きくしたい、コントラストを上げたい、動きを減らしたい場合の設定です。",
  "settings.textSize": "文字サイズ",
  "settings.textSizeNote": "本文だけでなく画面全体を拡大します。",
  "settings.size.default": "標準",
  "settings.size.large": "大",
  "settings.size.xlarge": "最大",
  "settings.contrast": "コントラスト",
  "settings.contrastNote": "文字を明るくし、境界線を強調します。",
  "settings.contrast.default": "標準",
  "settings.contrast.high": "ハイコントラスト",
  "settings.motion": "動き",
  "settings.motionNote": "アニメーションとスムーススクロールを無効にします。",
  "settings.motion.default": "標準",
  "settings.motion.reduced": "動きを減らす",
  "settings.font": "書体",
  "settings.fontNote": "幅の広い書体は読みやすい場合があります。",
  "settings.font.default": "標準",
  "settings.font.dyslexic": "読みやすい書体",
  "settings.focusRing": "フォーカス枠を強調",
  "settings.focusRingNote": "キーボードの位置がはっきりします。",
  "settings.underlineLinks": "リンクに常に下線",
  "settings.underlineLinksNote": "色だけに頼りません。",

  "settings.language": "言語",
  "settings.languageNote":
    "画面表示を翻訳します。カタログのプロンプトは英語のままです。",

  "settings.general": "一般",
  "settings.confirmDestructive": "削除前に確認",
  "settings.confirmDestructiveNote": "プロンプトやエージェントを削除する前に確認します。",

  "settings.data": "あなたのデータ",
  "settings.dataNote":
    "ライブラリ、会話、設定はこのブラウザーに保存されています。書き出すと控えを保存できます。",
  "settings.export": "ライブラリを書き出す",
  "settings.import": "ライブラリを読み込む",
  "settings.reset": "設定をリセット",
  "settings.resetDone": "設定を初期状態に戻しました。",

  "forum.title": "フォーラム",
  "forum.myPrompts": "自分のプロンプト",
  "forum.backToForum": "フォーラムに戻る",
  "forum.public": "公開",
  "forum.private": "非公開",
  "forum.publish": "フォーラムに公開",
  "forum.publishAnon": "匿名で公開",
  "forum.savePrivately": "非公開で保存",
  "forum.empty": "まだ公開されたプロンプトはありません。",

  "profile.yours": "自分のプロフィール",
  "profile.author": "作成者のプロフィール",
  "profile.publicPrompts": "公開プロンプト",
  "profile.private": "非公開",
  "profile.joined": "登録日",
  "profile.displayName": "表示名",
  "profile.yourPrompts": "自分のプロンプト",
  "profile.save": "保存",
  "profile.anonymous": "匿名",
};

const zh: Dictionary = {
  "nav.discover": "发现",
  "nav.library": "资料库",
  "nav.studio": "提示词工作室",
  "nav.forum": "论坛",
  "nav.settings": "设置",
  "nav.export": "导出",
  "nav.import": "导入",
  "nav.signOut": "退出登录",
  "nav.skipToContent": "跳到主要内容",

  "settings.title": "设置",
  "settings.subtitle": "偏好设置保存在本设备上。",
  "settings.accessibility": "无障碍",
  "settings.accessibilityNote":
    "Prompt Lab 使用语义化标题、带标签的控件和可用键盘操作的按钮，屏幕阅读器可以正常浏览。以下选项适用于需要更大字号、更强对比度或更少动效的情况。",
  "settings.textSize": "文字大小",
  "settings.textSizeNote": "缩放整个界面，而不只是正文。",
  "settings.size.default": "默认",
  "settings.size.large": "大",
  "settings.size.xlarge": "最大",
  "settings.contrast": "对比度",
  "settings.contrastNote": "提高文字亮度并加强边框。",
  "settings.contrast.default": "默认",
  "settings.contrast.high": "高对比度",
  "settings.motion": "动效",
  "settings.motionNote": "关闭过渡动画与平滑滚动。",
  "settings.motion.default": "默认",
  "settings.motion.reduced": "减少动效",
  "settings.font": "字体",
  "settings.fontNote": "更宽的字体可能更易阅读。",
  "settings.font.default": "默认",
  "settings.font.dyslexic": "易读字体",
  "settings.focusRing": "加强焦点轮廓",
  "settings.focusRingNote": "让键盘位置更明显。",
  "settings.underlineLinks": "始终为链接加下划线",
  "settings.underlineLinksNote": "不只依赖颜色区分。",

  "settings.language": "语言",
  "settings.languageNote": "翻译界面。目录中的提示词仍为英文。",

  "settings.general": "通用",
  "settings.confirmDestructive": "删除前确认",
  "settings.confirmDestructiveNote": "删除提示词或智能体前先询问。",

  "settings.data": "你的数据",
  "settings.dataNote":
    "你的资料库、对话与设置都保存在此浏览器中。导出可保留一份副本。",
  "settings.export": "导出资料库",
  "settings.import": "导入资料库",
  "settings.reset": "重置偏好设置",
  "settings.resetDone": "偏好设置已恢复默认。",

  "forum.title": "论坛",
  "forum.myPrompts": "我的提示词",
  "forum.backToForum": "返回论坛",
  "forum.public": "公开",
  "forum.private": "私密",
  "forum.publish": "发布到论坛",
  "forum.publishAnon": "匿名发布",
  "forum.savePrivately": "保存为私密",
  "forum.empty": "还没有发布的提示词。",

  "profile.yours": "我的主页",
  "profile.author": "作者主页",
  "profile.publicPrompts": "公开提示词",
  "profile.private": "私密",
  "profile.joined": "加入于",
  "profile.displayName": "你的显示名称",
  "profile.yourPrompts": "我的提示词",
  "profile.save": "保存",
  "profile.anonymous": "匿名",
};

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, es, ja, zh };

export function translate(language: LanguageCode, key: TranslationKey): string {
  return DICTIONARIES[language]?.[key] ?? en[key];
}

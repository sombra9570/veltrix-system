'use client';
// Selector de idioma y barra regional de la consola del superadmin.
// Sus textos viven aquí (no en el paquete de todos los usuarios).
import { useLanguage, COUNTRIES, LANGUAGES, useDeviceClock, type LangCode, type CountryCode, type CurrencyMode, type TaxRegimeId, type BusinessSectorId } from '../../language-selector';

export const translations = {
  es: {
    saasPanel: 'PANEL DE CONTROL SAAS',
    monthlySub: 'Suscripción Mensual',
    perMonth: 'mes',
    goToAdmin: 'Ir a Consola Admin →',
    moduleConfig: 'Configuración de Módulos',
    crmTitle: 'CRM & Clientes',
    crmDesc: 'Gestión de prospectos, embudos y relaciones comerciales.',
    posTitle: 'Punto de Venta (POS)',
    posDesc: 'Facturación rápida, caja y control de inventario.',
    creditTitle: 'Control de Créditos',
    creditDesc: 'Gestión de préstamos, cuotas y carteras de cobro.',
    hrTitle: 'Recursos Humanos',
    hrDesc: 'Control de personal, asistencia y nómina.',
    backHome: '← Volver al Inicio',
    globalConsole: 'Consola Global',
    adminSubtitle: 'Control de empresas registradas, licencias y módulos contratados.',
    mrr: 'Ingresos Mensuales (MRR)',
    newCompany: '+ Nueva Empresa',
    companiesTitle: 'Empresas en el Ecosistema',
    activeService: 'Servicio Activo',
    suspendedService: 'Suspendido por Impago',
    businessType: 'Giro de negocio:',
    monthlyFee: 'Tarifa Mensual',
    suspendBtn: 'Suspender Acceso',
    reactivateBtn: 'Reactivar Cuenta',
    timezoneLabel: 'Zona Horaria (Sucursal)',
    currencyLabel: 'Moneda (Sync 24h)',
    taxConfigLabel: 'Régimen Fiscal y Rubro',
    localTimeLabel: 'Hora Local de Sucursal',
  },
  en: {
    saasPanel: 'SAAS CONTROL PANEL',
    monthlySub: 'Monthly Subscription',
    perMonth: 'mo',
    goToAdmin: 'Go to Admin Console →',
    moduleConfig: 'Module Configuration',
    crmTitle: 'CRM & Clients',
    crmDesc: 'Lead management, funnels, and business relationships.',
    posTitle: 'Point of Sale (POS)',
    posDesc: 'Fast billing, register, and inventory control.',
    creditTitle: 'Credit Control',
    creditDesc: 'Loan management, installments, and collection portfolios.',
    hrTitle: 'Human Resources',
    hrDesc: 'Staff control, attendance, and payroll.',
    backHome: '← Back to Home',
    globalConsole: 'Global Console',
    adminSubtitle: 'Management of registered companies, licenses, and active modules.',
    mrr: 'Monthly Revenue (MRR)',
    newCompany: '+ New Company',
    companiesTitle: 'Companies in the Ecosystem',
    activeService: 'Active Service',
    suspendedService: 'Suspended for Non-payment',
    businessType: 'Business type:',
    monthlyFee: 'Monthly Fee',
    suspendBtn: 'Suspend Access',
    reactivateBtn: 'Reactivate Account',
    timezoneLabel: 'Timezone (Branch)',
    currencyLabel: 'Currency (24h Auto-Sync)',
    taxConfigLabel: 'Tax Regime & Sector',
    localTimeLabel: 'Branch Local Time',
  },
  it: {
    saasPanel: 'PANNELLO DI CONTROLLO SAAS',
    monthlySub: 'Abbonamento Mensile',
    perMonth: 'mese',
    goToAdmin: 'Vai alla Console Admin →',
    moduleConfig: 'Configurazione Moduli',
    crmTitle: 'CRM & Clienti',
    crmDesc: 'Gestione contatti, funnel e relazioni commerciali.',
    posTitle: 'Punto Vendita (POS)',
    posDesc: 'Fatturazione rapida, cassa e controllo inventario.',
    creditTitle: 'Controllo Crediti',
    creditDesc: 'Gestione prestiti, rate e portafogli di riscossione.',
    hrTitle: 'Risorse Umane',
    hrDesc: 'Controllo del personale, presenze e buste paga.',
    backHome: '← Torna alla Home',
    globalConsole: 'Console Globale',
    adminSubtitle: 'Controllo delle aziende registrate, licenze e moduli attivi.',
    mrr: 'Entrate Mensili (MRR)',
    newCompany: '+ Nuova Azienda',
    companiesTitle: 'Aziende nell\'Ecosistema',
    activeService: 'Servizio Attivo',
    suspendedService: 'Sospeso per Mancato Pagamento',
    businessType: 'Settore:',
    monthlyFee: 'Tariffa Mensile',
    suspendBtn: 'Sospendi Accesso',
    reactivateBtn: 'Riattiva Account',
    timezoneLabel: 'Fuso Orario (Filiale)',
    currencyLabel: 'Valuta (Sync 24h)',
    taxConfigLabel: 'Regime Fiscale e Settore',
    localTimeLabel: 'Ora Locale Filiale',
  },
  pt: {
    saasPanel: 'PAINEL DE CONTROLE SAAS',
    monthlySub: 'Assinatura Mensal',
    perMonth: 'mês',
    goToAdmin: 'Ir para Console Admin →',
    moduleConfig: 'Configuração de Módulos',
    crmTitle: 'CRM & Clientes',
    crmDesc: 'Gestão de leads, funis e relações comerciais.',
    posTitle: 'Ponto de Venda (PDV)',
    posDesc: 'Faturamento rápido, caixa e controle de estoque.',
    creditTitle: 'Controle de Crédito',
    creditDesc: 'Gestão de empréstimos, parcelas e cobranças.',
    hrTitle: 'Recursos Humanos',
    hrDesc: 'Controle de pessoal, frequência e folha de pagamento.',
    backHome: '← Voltar ao Início',
    globalConsole: 'Console Global',
    adminSubtitle: 'Controle de empresas registradas, licenças e módulos.',
    mrr: 'Receita Mensal (MRR)',
    newCompany: '+ Nova Empresa',
    companiesTitle: 'Empresas no Ecossistema',
    activeService: 'Serviço Ativo',
    suspendedService: 'Suspenso por Inadimplência',
    businessType: 'Ramo de negócio:',
    monthlyFee: 'Taxa Mensal',
    suspendBtn: 'Suspender Acesso',
    reactivateBtn: 'Reativar Conta',
    timezoneLabel: 'Fuso Horário (Filial)',
    currencyLabel: 'Moeda (Sync 24h)',
    taxConfigLabel: 'Regime Fiscal e Setor',
    localTimeLabel: 'Hora Local da Filial',
  },
  fr: {
    saasPanel: 'PANNEAU DE CONTRÔLE SAAS',
    monthlySub: 'Abonnement Mensuel',
    perMonth: 'mois',
    goToAdmin: 'Aller à la Console Admin →',
    moduleConfig: 'Configuration des Modules',
    crmTitle: 'CRM & Clients',
    crmDesc: 'Gestion des prospects, entonnoirs et relations commerciales.',
    posTitle: 'Point de Vente (PDV)',
    posDesc: 'Facturation rapide, caisse et contrôle des stocks.',
    creditTitle: 'Contrôle du Crédit',
    creditDesc: 'Gestion des prêts, échéances et recouvrements.',
    hrTitle: 'Ressources Humaines',
    hrDesc: 'Contrôle du personnel, présence et paie.',
    backHome: '← Retour à l\'Accueil',
    globalConsole: 'Console Globale',
    adminSubtitle: 'Gestion des entreprises enregistrées, licences et modules.',
    mrr: 'Revenu Mensuel (MRR)',
    newCompany: '+ Nouvelle Entreprise',
    companiesTitle: 'Entreprises dans l\'Écosystème',
    activeService: 'Service Actif',
    suspendedService: 'Suspendu pour Non-paiement',
    businessType: 'Secteur d\'activité:',
    monthlyFee: 'Tarif Mensuel',
    suspendBtn: 'Suspendre l\'Accès',
    reactivateBtn: 'Réactiver le Compte',
    timezoneLabel: 'Fuseau Horaire (Région)',
    currencyLabel: 'Devise (Sync 24h)',
    taxConfigLabel: 'Régime Fiscal & Secteur',
    localTimeLabel: 'Heure Locale Succursale',
  },
  de: {
    saasPanel: 'SAAS-STEUERZENTRALE',
    monthlySub: 'Monatsabonnement',
    perMonth: 'Mon.',
    goToAdmin: 'Zur Admin-Konsole →',
    moduleConfig: 'Modulkonfiguration',
    crmTitle: 'CRM & Kunden',
    crmDesc: 'Lead-Management, Trichter und Geschäftsbeziehungen.',
    posTitle: 'Kassensystem (POS)',
    posDesc: 'Schnelle Abrechnung, Kasse und Bestandskontrolle.',
    creditTitle: 'Kreditkontrolle',
    creditDesc: 'Kreditverwaltung, Raten und Inkassoportfolios.',
    hrTitle: 'Personalwesen (HR)',
    hrDesc: 'Personalsteuerung, Anwesenheit und Gehaltsabrechnung.',
    backHome: '← Zurück zur Startseite',
    globalConsole: 'Globale Konsole',
    adminSubtitle: 'Verwaltung registrierter Unternehmen, Lizenzen und Module.',
    mrr: 'Monatlicher Umsatz (MRR)',
    newCompany: '+ Neues Unternehmen',
    companiesTitle: 'Unternehmen im Ökosystem',
    activeService: 'Aktiver Dienst',
    suspendedService: 'Gesperrt wegen Nichtzahlung',
    businessType: 'Geschäftszweig:',
    monthlyFee: 'Monatliche Gebühr',
    suspendBtn: 'Zugang Sperren',
    reactivateBtn: 'Konto Reaktivieren',
    timezoneLabel: 'Zeitzone (Region)',
    currencyLabel: 'Währung (24h Sync)',
    taxConfigLabel: 'Steuerregime & Branche',
    localTimeLabel: 'Ortszeit Filiale',
  },
  zh: {
    saasPanel: 'SAAS 控制面板',
    monthlySub: '按月订阅',
    perMonth: '月',
    goToAdmin: '前往管理控制台 →',
    moduleConfig: '模块配置',
    crmTitle: 'CRM 与客户',
    crmDesc: '潜在客户管理、销售漏斗和商业关系。',
    posTitle: '销售终端 (POS)',
    posDesc: '快速开单、收银和库存控制。',
    creditTitle: '信贷控制',
    creditDesc: '贷款管理、分期付款和催收组合。',
    hrTitle: '人力资源',
    hrDesc: '员工管理、考勤和薪资核算。',
    backHome: '← 返回首页',
    globalConsole: '全局控制台',
    adminSubtitle: '管理注册企业、许可证和已签约模块。',
    mrr: '月度经常性收入 (MRR)',
    newCompany: '+ 新增企业',
    companiesTitle: '生态系统中的企业',
    activeService: '服务正常',
    suspendedService: '欠费停用',
    businessType: '业务类型：',
    monthlyFee: '月费',
    suspendBtn: '暂停访问',
    reactivateBtn: '重新激活',
    timezoneLabel: '时区 (选择地区)',
    currencyLabel: '货币 (24小时自动更新)',
    taxConfigLabel: '税收制度与行业',
    localTimeLabel: '分店当地时间',
  },
  ja: {
    saasPanel: 'SAAS コントロールパネル',
    monthlySub: '月額サブスクリプション',
    perMonth: '月',
    goToAdmin: '管理コンソールへ →',
    moduleConfig: 'モジュール設定',
    crmTitle: 'CRM & 顧客管理',
    crmDesc: 'リード管理、ファネル、および取引関係の管理。',
    posTitle: '販売時点情報管理 (POS)',
    posDesc: '迅速な請求、レジ、在庫管理。',
    creditTitle: '与信・債権管理',
    creditDesc: 'ローン管理、分割払い、回収ポートフォリオ。',
    hrTitle: '人事・労務 (HR)',
    hrDesc: 'スタッフ管理、勤怠、給与計算。',
    backHome: '← ホームに戻る',
    globalConsole: 'グローバルコンソール',
    adminSubtitle: '登録企業、ライセンス、契約モジュールの管理。',
    mrr: '月次経常収益 (MRR)',
    newCompany: '+ 新規企業',
    companiesTitle: 'エコシステム内の企業',
    activeService: '稼働中',
    suspendedService: '未払いにより停止中',
    businessType: '業種:',
    monthlyFee: '月額料金',
    suspendBtn: 'アクセス停止',
    reactivateBtn: 'アカウント再開',
    timezoneLabel: 'タイムゾーン (地域)',
    currencyLabel: '通貨 (24時間自動更新)',
    taxConfigLabel: '税制・業種設定',
    localTimeLabel: '支店の現地時間',
  },
  ru: {
    saasPanel: 'ПАНЕЛЬ УПРАВЛЕНИЯ SAAS',
    monthlySub: 'Ежемесячная подписка',
    perMonth: 'мес',
    goToAdmin: 'В консоль админа →',
    moduleConfig: 'Настройка модулей',
    crmTitle: 'CRM и Клиенты',
    crmDesc: 'Управление лидами, воронками и деловыми связями.',
    posTitle: 'Точка продаж (POS)',
    posDesc: 'Быстрые счета, касса и складской учет.',
    creditTitle: 'Кредитный контроль',
    creditDesc: 'Управление займами, рассрочками и взысканием.',
    hrTitle: 'Отдел кадров (HR)',
    hrDesc: 'Учет персонала, посещаемости и зарплаты.',
    backHome: '← На главную',
    globalConsole: 'Глобальная консоль',
    adminSubtitle: 'Управление компаниями, лицензиями и модулями.',
    mrr: 'Ежемесячный доход (MRR)',
    newCompany: '+ Новая компания',
    companiesTitle: 'Компании в экосистеме',
    activeService: 'Активен',
    suspendedService: 'Приостановлен за неуплату',
    businessType: 'Сфера бизнеса:',
    monthlyFee: 'Абонентская плата',
    suspendBtn: 'Приостановить',
    reactivateBtn: 'Активировать',
    timezoneLabel: 'Часовой пояс (Регион)',
    currencyLabel: 'Валюта (Авто 24ч)',
    taxConfigLabel: 'Налоговый режим и сфера',
    localTimeLabel: 'Местное время филиала',
  },
  ar: {
    saasPanel: 'لوحة تحكم SAAS',
    monthlySub: 'الاشتراك الشهري',
    perMonth: 'شهر',
    goToAdmin: 'إلى لوحة المسؤول ←',
    moduleConfig: 'إعدادات الوحدات',
    crmTitle: 'إدارة العملاء (CRM)',
    crmDesc: 'إدارة العملاء المحتملين وقنوات البيع والعلاقات التجارية.',
    posTitle: 'نقطة البيع (POS)',
    posDesc: 'فوترة سريعة، صندوق النقد والتحكم في المخزون.',
    creditTitle: 'مراقبة الائتمان',
    creditDesc: 'إدارة القروض والأقساط ومحافظ التحصيل.',
    hrTitle: 'الموارد البشرية',
    hrDesc: 'إدارة الموظفين والحضور والرواتب.',
    backHome: '→ العودة للرئيسية',
    globalConsole: 'وحدة التحكم الشاملة',
    adminSubtitle: 'إدارة الشركات المسجلة والتراخيص والوحدات النشطة.',
    mrr: 'الإيرادات الشهرية (MRR)',
    newCompany: '+ شركة جديدة',
    companiesTitle: 'الشركات في النظام',
    activeService: 'خدمة نشطة',
    suspendedService: 'معلق لعدم الدفع',
    businessType: 'نوع النشاط:',
    monthlyFee: 'الرسوم الشهرية',
    suspendBtn: 'إيقاف الوصول',
    reactivateBtn: 'إعادة التفعيل',
    timezoneLabel: 'المنطقة الزمنية (الفرع)',
    currencyLabel: 'العملة (تحديث 24 ساعة)',
    taxConfigLabel: 'النظام الضريبي والقطاع',
    localTimeLabel: 'التوقيت المحلي للفرع',
  },
  ko: {
    saasPanel: 'SAAS 제어판',
    monthlySub: '월간 구독',
    perMonth: '월',
    goToAdmin: '관리자 콘솔로 이동 →',
    moduleConfig: '모듈 구성',
    crmTitle: 'CRM 및 고객',
    crmDesc: '리드 관리, 판매 퍼널 및 비즈니스 관계.',
    posTitle: '판매 시점 관리 (POS)',
    posDesc: '빠른 청구, 계산대 및 재고 관리.',
    creditTitle: '신용 관리',
    creditDesc: '대출 관리, 할부 및 추심 포트폴리오.',
    hrTitle: '인사 관리 (HR)',
    hrDesc: '직원 관리, 근태 및 급여.',
    backHome: '← 홈으로 돌아가기',
    globalConsole: '글로벌 콘솔',
    adminSubtitle: '등록된 기업, 라이선스 및 계약 모듈 관리.',
    mrr: '월간 반복 매출 (MRR)',
    newCompany: '+ 새 기업 추가',
    companiesTitle: '에코시스템 내 기업',
    activeService: '활성 서비스',
    suspendedService: '미납으로 정지됨',
    businessType: '업종:',
    monthlyFee: '월 요금',
    suspendBtn: '접근 정지',
    reactivateBtn: '계정 재활성화',
    timezoneLabel: '시간대 (지역)',
    currencyLabel: '통화 (24시간 자동 동기화)',
    taxConfigLabel: '과세 유형 및 업종',
    localTimeLabel: '지점 현지 시간',
  },
  hi: {
    saasPanel: 'SAAS कंट्रोल पैनल',
    monthlySub: 'मासिक सदस्यता',
    perMonth: 'माह',
    goToAdmin: 'एडमिन कंसोल पर जाएं →',
    moduleConfig: 'मॉड्यूल कॉन्फ़िगरेशन',
    crmTitle: 'CRM और ग्राहक',
    crmDesc: 'लीड प्रबंधन, फ़नल और व्यावसायिक संबंध।',
    posTitle: 'पॉइंट ऑफ़ सेल (POS)',
    posDesc: 'तेज़ बिलिंग, कैश रजिस्टर और इन्वेंट्री नियंत्रण।',
    creditTitle: 'क्रेडिट नियंत्रण',
    creditDesc: 'ऋण प्रबंधन, किस्तें और वसूली पोर्टफोलियो।',
    hrTitle: 'मानव संसाधन (HR)',
    hrDesc: 'कर्मचारी नियंत्रण, उपस्थिति और पेरोल।',
    backHome: '← होम पर वापस जाएं',
    globalConsole: 'ग्लोबल कंसोल',
    adminSubtitle: 'पंजीकृत कंपनियों, लाइसेंस और मॉड्यूल का प्रबंधन।',
    mrr: 'मासिक आय (MRR)',
    newCompany: '+ नई कंपनी',
    companiesTitle: 'इकोसिस्टम में कंपनियां',
    activeService: 'सक्रिय सेवा',
    suspendedService: 'भुगतान न करने पर निलंबित',
    businessType: 'व्यवसाय का प्रकार:',
    monthlyFee: 'मासिक शुल्क',
    suspendBtn: 'पहुंच निलंबित करें',
    reactivateBtn: 'खाता पुनः सक्रिय करें',
    timezoneLabel: 'समय क्षेत्र (शाखा)',
    currencyLabel: 'मुद्रा (24 घंटे ऑटो-सिंक)',
    taxConfigLabel: 'कर प्रणाली और क्षेत्र',
    localTimeLabel: 'शाखा स्थानीय समय',
  },
};


export function LanguageDropdown() {
  const { lang, setLanguage, country, setCountryByCode } = useLanguage();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={country.code}
        onChange={(e) => setCountryByCode(e.target.value as CountryCode)}
        className="bg-slate-900 border border-slate-700 hover:border-emerald-500 text-white text-xs font-semibold rounded-lg px-3 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code} className="bg-slate-900 text-white">
            {c.flag} {c.name} ({c.currency})
          </option>
        ))}
      </select>

      <select
        value={lang}
        onChange={(e) => setLanguage(e.target.value as LangCode)}
        className="bg-slate-900 border border-slate-700 hover:border-blue-500 text-white text-xs font-semibold rounded-lg px-3 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-slate-900 text-white">
            {l.flag} {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RegionalStatusBar() {
  const {
    country,
    selectedTimezone,
    setSelectedTimezoneByTz,
    activeRate,
    officialRate,
    setCustomRate,
    resetRateToOfficial,
    syncOfficialRatesNow,
    lastRateSync,
    currencyMode,
    setCurrencyMode,
    taxRegime,
    setTaxRegime,
    businessSector,
    setBusinessSector,
    effectiveTaxRate,
    lang,
  } = useLanguage();
  const t = translations[lang] || translations.es;
  const localTime = useDeviceClock(COUNTRIES.find((c) => c.code === country.code)?.locale ?? 'es', selectedTimezone.tz);

  const rawCountry = COUNTRIES.find((c) => c.code === country.code) || COUNTRIES[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs">
      {/* 1. Reloj Local en vivo */}
      <div className="flex flex-col justify-center">
        <span className="text-slate-400">{t.localTimeLabel}</span>
        <span className="font-mono text-sm font-bold text-emerald-400 mt-1">
          🕒 {localTime} ({selectedTimezone.utcOffset})
        </span>
        <span className="text-[11px] text-slate-500 mt-0.5">
          Tel: {country.phonePrefix} · ID Fiscal: {country.taxIdName}
        </span>
      </div>

      {/* 2. Selector de Zona Horaria dentro del país */}
      <div className="flex flex-col justify-center">
        <span className="text-slate-400">{t.timezoneLabel}</span>
        <select
          value={selectedTimezone.tz}
          onChange={(e) => setSelectedTimezoneByTz(e.target.value)}
          className="mt-1 bg-slate-950 border border-slate-700 hover:border-blue-500 text-slate-200 font-semibold rounded-lg px-2.5 py-1.5 text-xs cursor-pointer focus:outline-none"
        >
          {country.timezones.map((tzObj) => (
            <option key={tzObj.tz} value={tzObj.tz} className="bg-slate-900 text-white">
              🌍 {tzObj.label} ({tzObj.utcOffset})
            </option>
          ))}
        </select>
      </div>

      {/* 3. Moneda con Auto-Sync cada 24h + Tasa Editable */}
      <div className="flex flex-col justify-center space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">
            {t.currencyLabel} <span className="text-emerald-400">({lastRateSync})</span>
          </span>
          <div className="flex items-center gap-2">
            {activeRate !== officialRate && (
              <button
                onClick={resetRateToOfficial}
                className="text-[10px] text-amber-400 hover:underline"
                title="Volver a tasa oficial"
              >
                ↺ Oficial ({officialRate})
              </button>
            )}
            <button
              onClick={syncOfficialRatesNow}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded"
              title="Actualizar tipo de cambio oficial ahora"
            >
              🔄 Sync
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-blue-400 font-bold">1$ =</span>
          <input
            type="number"
            step="0.01"
            value={activeRate}
            onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
            className="w-20 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded px-2 py-1 text-white font-bold text-xs"
          />
          <span className="text-slate-300 font-semibold">{country.currency}</span>
          <select
            value={currencyMode}
            onChange={(e) => setCurrencyMode(e.target.value as CurrencyMode)}
            className="ml-auto bg-slate-950 border border-slate-700 text-slate-200 rounded px-1.5 py-1 text-[11px]"
          >
            <option value="dual">{country.currency} + USD</option>
            <option value="local">Solo {country.currency}</option>
            <option value="anchor">Solo USD</option>
          </select>
        </div>
      </div>

      {/* 4. Motor Fiscal Inteligente: Régimen (General / Simplificado / Exento) y Rubro */}
      <div className="flex flex-col justify-center space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">{t.taxConfigLabel}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              effectiveTaxRate === 0
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-purple-500/20 text-purple-300'
            }`}
          >
            🏛️ {country.taxName}: {effectiveTaxRate}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={taxRegime}
            onChange={(e) => setTaxRegime(e.target.value as TaxRegimeId)}
            className="bg-slate-950 border border-slate-700 hover:border-purple-500 text-slate-200 rounded px-2 py-1 text-[11px] font-medium focus:outline-none"
            title="Régimen Tributario del Negocio"
          >
            <option value="general">Régimen General ({rawCountry.taxRate}%)</option>
            <option value="simplified">{rawCountry.simplifiedRegimeName}</option>
            <option value="exempt">Exento / Exportación (0%)</option>
          </select>

          <select
            value={businessSector}
            onChange={(e) => setBusinessSector(e.target.value as BusinessSectorId)}
            disabled={taxRegime !== 'general'}
            className="bg-slate-950 border border-slate-700 hover:border-purple-500 disabled:opacity-40 text-slate-200 rounded px-2 py-1 text-[11px] font-medium focus:outline-none"
            title="Rubro o Sector Económico"
          >
            <option value="standard">Comercio / POS ({rawCountry.taxRate}%)</option>
            <option value="essential">Básicos / Salud / Agro ({rawCountry.reducedTaxRate}%)</option>
            <option value="special">Especial / Finanzas ({rawCountry.specialTaxRate}%)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

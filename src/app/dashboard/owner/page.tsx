'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageDropdown, RegionalStatusBar, LangCode } from '../../language-selector';
import { useVeltrixAuth } from '../../auth-system';

const OWNER_TEXTS: Record<LangCode, {
  badge: string;
  ceo: string;
  isolatedSession: string;
  logoutBtn: string;
  graceTitle: (days: number) => string;
  retentionTitle: (days: number) => string;
  graceDesc: string;
  retentionDesc: string;
  exportBtn: string;
  payBtn: (amount: string) => string;
  suspendedTitle: string;
  suspendedDesc: (count: number) => string;
  activeLicenses: string;
  online: string;
  iamTitle: string;
  iamDesc: (company: string) => string;
  phName: string;
  phEmail: string;
  phPass: string;
  roleCashier: string;
  roleVendor: string;
  roleCollector: string;
  roleSupervisor: string;
  addBtn: string;
  badgeCashier: string;
  badgeVendor: string;
  badgeCollector: string;
  badgeSupervisor: string;
  accessId: string;
  passLabel: string;
  statusActive: string;
  statusRevoked: string;
}> = {
  es: {
    badge: '🏛️ Consola de Dirección Ejecutiva · Tenant Admin',
    ceo: 'Director General',
    isolatedSession: 'Sesión Corporativa Aislada',
    logoutBtn: 'Cerrar Sesión Ejecutiva',
    graceTitle: (d) => `⏳ Facturación Vencida — Ventana de Portabilidad Activa (${d} días restantes)`,
    retentionTitle: (d) => `🔒 Instancia en Custodia Pasiva — Resguardo en Bóveda por ${d} días adicionales`,
    graceDesc: 'Dispone de hasta 7 días corridos para regularizar su suscripción o ejecutar la exportación íntegra de sus registros contables y operativos.',
    retentionDesc: 'El período de portabilidad de 7 días ha concluido. Su base de datos permanecerá resguardada durante 30 días antes de su depuración definitiva.',
    exportBtn: '⬇ Exportar Base de Datos (.JSON)',
    payBtn: (amt) => `💳 Regularizar Suscripción (${amt})`,
    suspendedTitle: 'Operación Suspendida — Instancia en Bóveda de Retención',
    suspendedDesc: (c) => `Los accesos operativos de sus ${c} colaboradores se encuentran temporalmente inhabilitados. Regularice el canon mensual para restablecer los servicios en tiempo real.`,
    activeLicenses: 'Licencias Activas',
    online: 'En Línea',
    iamTitle: '🔐 Gestión de Credenciales y Accesos (IAM)',
    iamDesc: (comp) => `Administre las cuentas operativas de su personal. Cada operador accederá exclusivamente a la terminal asignada dentro de ${comp}.`,
    phName: 'Nombre del colaborador',
    phEmail: 'Correo institucional',
    phPass: 'Clave temporal',
    roleCashier: 'Operador POS',
    roleVendor: 'Ejecutivo CRM',
    roleCollector: 'Cobrador de Ruta',
    roleSupervisor: 'Supervisor Cartera',
    addBtn: '+ Alta',
    badgeCashier: '💳 Terminal Operativa POS',
    badgeVendor: '📈 Estación Comercial CRM',
    badgeCollector: '🛵 Ruta de Cobranza en Calle',
    badgeSupervisor: '📊 Supervisión de Cartera',
    accessId: 'ID Acceso',
    passLabel: 'Clave',
    statusActive: '● Habilitado (Revocar)',
    statusRevoked: '○ Revocado (Habilitar)',
  },
  en: {
    badge: '🏛️ Executive Management Console · Tenant Admin',
    ceo: 'General Director',
    isolatedSession: 'Isolated Corporate Session',
    logoutBtn: 'Log Out Executive Session',
    graceTitle: (d) => `⏳ Billing Overdue — Portability Window Active (${d} days left)`,
    retentionTitle: (d) => `🔒 Instance in Passive Custody — Vault Retention for ${d} additional days`,
    graceDesc: 'You have up to 7 calendar days to regularize your subscription or export your full accounting and operational records.',
    retentionDesc: 'The 7-day portability period has ended. Your database will remain safeguarded for 30 days before permanent deletion.',
    exportBtn: '⬇ Export Database (.JSON)',
    payBtn: (amt) => `💳 Regularize Subscription (${amt})`,
    suspendedTitle: 'Operation Suspended — Instance in Retention Vault',
    suspendedDesc: (c) => `Operational access for your ${c} staff members is temporarily disabled. Regularize the monthly fee to restore real-time services.`,
    activeLicenses: 'Active Licenses',
    online: 'Online',
    iamTitle: '🔐 Credential & Access Management (IAM)',
    iamDesc: (comp) => `Manage your staff operational accounts. Each operator will exclusively access their assigned terminal within ${comp}.`,
    phName: 'Staff member name',
    phEmail: 'Corporate email',
    phPass: 'Temporary password',
    roleCashier: 'POS Operator',
    roleVendor: 'CRM Executive',
    roleCollector: 'Field Collector',
    roleSupervisor: 'Portfolio Supervisor',
    addBtn: '+ Add',
    badgeCashier: '💳 POS Operational Terminal',
    badgeVendor: '📈 CRM Commercial Station',
    badgeCollector: '🛵 Field Collection Route',
    badgeSupervisor: '📊 Portfolio Supervision',
    accessId: 'Access ID',
    passLabel: 'Key',
    statusActive: '● Enabled (Revoke)',
    statusRevoked: '○ Revoked (Enable)',
  },
  it: {
    badge: '🏛️ Console di Direzione Esecutiva · Tenant Admin',
    ceo: 'Direttore Generale',
    isolatedSession: 'Sessione Aziendale Isolata',
    logoutBtn: 'Chiudi Sessione Esecutiva',
    graceTitle: (d) => `⏳ Fatturazione Scaduta — Finestra di Portabilità Attiva (${d} giorni rimasti)`,
    retentionTitle: (d) => `🔒 Istanza in Custodia Passiva — Conservazione in Caveau per ${d} giorni`,
    graceDesc: 'Hai fino a 7 giorni per regolarizzare l\'abbonamento o esportare tutti i record contabili e operativi.',
    retentionDesc: 'Il periodo di portabilità di 7 giorni è terminato. Il database resterà protetto per 30 giorni prima della cancellazione.',
    exportBtn: '⬇ Esporta Database (.JSON)',
    payBtn: (amt) => `💳 Regolarizza Abbonamento (${amt})`,
    suspendedTitle: 'Operazione Sospesa — Istanza nel Caveau di Conservazione',
    suspendedDesc: (c) => `Gli accessi operativi dei tuoi ${c} collaboratori sono temporaneamente disabilitati. Regolarizza il canone mensile per ripristinare i servizi.`,
    activeLicenses: 'Licenze Attive',
    online: 'Online',
    iamTitle: '🔐 Gestione Credenziali e Accessi (IAM)',
    iamDesc: (comp) => `Gestisci gli account operativi del personale. Ogni operatore accederà esclusivamente al terminale assegnato in ${comp}.`,
    phName: 'Nome collaboratore',
    phEmail: 'Email aziendale',
    phPass: 'Password temporanea',
    roleCashier: 'Operatore POS',
    roleVendor: 'Esecutivo CRM',
    roleCollector: 'Esattore su Strada',
    roleSupervisor: 'Supervisore Portafoglio',
    addBtn: '+ Aggiungi',
    badgeCashier: '💳 Terminale Operativo POS',
    badgeVendor: '📈 Stazione Commerciale CRM',
    badgeCollector: '🛵 Percorso Riscossione',
    badgeSupervisor: '📊 Supervisione Portafoglio',
    accessId: 'ID Accesso',
    passLabel: 'Chiave',
    statusActive: '● Abilitato (Revoca)',
    statusRevoked: '○ Revocato (Abilita)',
  },
  pt: {
    badge: '🏛️ Console de Direção Executiva · Tenant Admin',
    ceo: 'Diretor Geral',
    isolatedSession: 'Sessão Corporativa Isolada',
    logoutBtn: 'Encerrar Sessão Executiva',
    graceTitle: (d) => `⏳ Fatura Vencida — Janela de Portabilidade Ativa (${d} dias restantes)`,
    retentionTitle: (d) => `🔒 Instância em Custódia Passiva — Cofre de Retenção por ${d} dias`,
    graceDesc: 'Você tem até 7 dias corridos para regularizar sua assinatura ou exportar seus registros contábeis e operacionais.',
    retentionDesc: 'O período de portabilidade de 7 dias terminou. Seu banco de dados ficará protegido por 30 dias antes da exclusão.',
    exportBtn: '⬇ Exportar Banco de Dados (.JSON)',
    payBtn: (amt) => `💳 Regularizar Assinatura (${amt})`,
    suspendedTitle: 'Operação Suspensa — Instância no Cofre de Retenção',
    suspendedDesc: (c) => `Os acessos operacionais dos seus ${c} colaboradores estão temporariamente desativados. Regularize a mensalidade para restaurar os serviços.`,
    activeLicenses: 'Licenças Ativas',
    online: 'Online',
    iamTitle: '🔐 Gestão de Credenciais e Acessos (IAM)',
    iamDesc: (comp) => `Gerencie as contas operacionais da sua equipe. Cada operador acessará exclusivamente o terminal atribuído em ${comp}.`,
    phName: 'Nome do colaborador',
    phEmail: 'E-mail corporativo',
    phPass: 'Senha temporária',
    roleCashier: 'Operador PDV',
    roleVendor: 'Executivo CRM',
    roleCollector: 'Cobrador de Rota',
    roleSupervisor: 'Supervisor de Carteira',
    addBtn: '+ Cadastrar',
    badgeCashier: '💳 Terminal Operacional PDV',
    badgeVendor: '📈 Estação Comercial CRM',
    badgeCollector: '🛵 Rota de Cobrança em Campo',
    badgeSupervisor: '📊 Supervisão de Carteira',
    accessId: 'ID Acesso',
    passLabel: 'Senha',
    statusActive: '● Habilitado (Revogar)',
    statusRevoked: '○ Revogado (Habilitar)',
  },
  fr: {
    badge: '🏛️ Console de Direction Exécutive · Tenant Admin',
    ceo: 'Directeur Général',
    isolatedSession: 'Session Corporative Isolée',
    logoutBtn: 'Fermer la Session Exécutive',
    graceTitle: (d) => `⏳ Facturation Échue — Fenêtre de Portabilité Active (${d} jours restants)`,
    retentionTitle: (d) => `🔒 Instance en Garde Passive — Conservation en Coffre pour ${d} jours`,
    graceDesc: 'Vous disposez de 7 jours pour régulariser votre abonnement ou exporter l\'intégralité de vos registres.',
    retentionDesc: 'La période de portabilité de 7 jours est terminée. Votre base de données restera sauvegardée pendant 30 jours.',
    exportBtn: '⬇ Exporter la Base de Données (.JSON)',
    payBtn: (amt) => `💳 Régulariser l'Abonnement (${amt})`,
    suspendedTitle: 'Opération Suspendue — Instance en Coffre de Rétention',
    suspendedDesc: (c) => `Les accès opérationnels de vos ${c} collaborateurs sont temporairement désactivés. Régularisez la mensualité pour rétablir les services.`,
    activeLicenses: 'Licences Actives',
    online: 'En Ligne',
    iamTitle: '🔐 Gestion des Identifiants et Accès (IAM)',
    iamDesc: (comp) => `Gérez les comptes opérationnels de votre personnel. Chaque opérateur accédera exclusivement au terminal attribué dans ${comp}.`,
    phName: 'Nom du collaborateur',
    phEmail: 'E-mail professionnel',
    phPass: 'Mot de passe temporaire',
    roleCashier: 'Opérateur PDV',
    roleVendor: 'Exécutif CRM',
    roleCollector: 'Agent de Recouvrement',
    roleSupervisor: 'Superviseur Portefeuille',
    addBtn: '+ Ajouter',
    badgeCashier: '💳 Terminal Opérationnel PDV',
    badgeVendor: '📈 Station Commerciale CRM',
    badgeCollector: '🛵 Tournée de Recouvrement',
    badgeSupervisor: '📊 Supervision de Portefeuille',
    accessId: 'ID Accès',
    passLabel: 'Clé',
    statusActive: '● Activé (Révoquer)',
    statusRevoked: '○ Révoqué (Activer)',
  },
  de: {
    badge: '🏛️ Geschäftsleitungskonsole · Tenant Admin',
    ceo: 'Geschäftsführer',
    isolatedSession: 'Isolierte Unternehmenssitzung',
    logoutBtn: 'Sitzung Beenden',
    graceTitle: (d) => `⏳ Überfällige Abrechnung — Portabilitätsfenster Aktiv (${d} Tage übrig)`,
    retentionTitle: (d) => `🔒 Instanz in Passiver Verwahrung — Tresor-Aufbewahrung für ${d} Tage`,
    graceDesc: 'Sie haben bis zu 7 Tage Zeit, Ihr Abonnement zu begleichen oder Ihre Buchhaltungsdaten vollständig zu exportieren.',
    retentionDesc: 'Die 7-tägige Portabilitätsfrist ist abgelaufen. Ihre Datenbank bleibt vor der Löschung 30 Tage lang gesichert.',
    exportBtn: '⬇ Datenbank Exportieren (.JSON)',
    payBtn: (amt) => `💳 Abonnement Begleichen (${amt})`,
    suspendedTitle: 'Betrieb Ausgesetzt — Instanz im Aufbewahrungstresor',
    suspendedDesc: (c) => `Die operativen Zugänge Ihrer ${c} Mitarbeiter sind vorübergehend deaktiviert. Begleichen Sie die Monatsgebühr, um den Dienst wiederherzustellen.`,
    activeLicenses: 'Aktive Lizenzen',
    online: 'Online',
    iamTitle: '🔐 Zugangs- und Berechtigungsverwaltung (IAM)',
    iamDesc: (comp) => `Verwalten Sie die Mitarbeiterkonten. Jeder Bediener greift ausschließlich auf sein zugewiesenes Terminal innerhalb von ${comp} zu.`,
    phName: 'Name des Mitarbeiters',
    phEmail: 'Firmen-E-Mail',
    phPass: 'Temporäres Passwort',
    roleCashier: 'POS-Bediener',
    roleVendor: 'CRM-Berater',
    roleCollector: 'Außendienst-Inkasso',
    roleSupervisor: 'Portfolio-Supervisor',
    addBtn: '+ Neu',
    badgeCashier: '💳 POS-Kassenterminal',
    badgeVendor: '📈 CRM-Vertriebsstation',
    badgeCollector: '🛵 Außendienst-Inkassoroute',
    badgeSupervisor: '📊 Portfolio-Überwachung',
    accessId: 'Zugangs-ID',
    passLabel: 'Passwort',
    statusActive: '● Aktiviert (Widerrufen)',
    statusRevoked: '○ Widerrufen (Aktivieren)',
  },
  zh: {
    badge: '🏛️ 执行管理控制台 · 租户管理员',
    ceo: '总经理',
    isolatedSession: '独立企业会话',
    logoutBtn: '退出高管会话',
    graceTitle: (d) => `⏳ 账单逾期 — 数据迁移窗口已激活 (剩余 ${d} 天)`,
    retentionTitle: (d) => `🔒 实例处于被动托管状态 — 保险库保留 ${d} 天`,
    graceDesc: '您有最多 7 天的时间来续订订阅或完整导出财务和运营记录。',
    retentionDesc: '7 天数据迁移期已结束。您的数据库将在永久清理前保留 30 天。',
    exportBtn: '⬇ 导出数据库 (.JSON)',
    payBtn: (amt) => `💳 续订订阅 (${amt})`,
    suspendedTitle: '运营已暂停 — 实例处于保留保险库中',
    suspendedDesc: (c) => `您的 ${c} 名员工的操作访问权限已暂时停用。请支付月费以实时恢复服务。`,
    activeLicenses: '有效许可证',
    online: '在线',
    iamTitle: '🔐 凭证与访问管理 (IAM)',
    iamDesc: (comp) => `管理员工的操作账户。每位操作员只能访问 ${comp} 内分配的专属终端。`,
    phName: '员工姓名',
    phEmail: '企业邮箱',
    phPass: '临时密码',
    roleCashier: 'POS 收银员',
    roleVendor: 'CRM 销售顾问',
    roleCollector: '外勤催收员',
    roleSupervisor: '账款主管',
    addBtn: '+ 添加',
    badgeCashier: '💳 POS 运营终端',
    badgeVendor: '📈 CRM 商业工作站',
    badgeCollector: '🛵 外勤催收路线',
    badgeSupervisor: '📊 账款组合监管',
    accessId: '访问 ID',
    passLabel: '密码',
    statusActive: '● 已启用 (撤销)',
    statusRevoked: '○ 已撤销 (启用)',
  },
  ja: {
    badge: '🏛️ エグゼクティブ管理コンソール · テナント管理者',
    ceo: '代表取締役',
    isolatedSession: '分離された企業セッション',
    logoutBtn: 'ログアウト',
    graceTitle: (d) => `⏳ 請求期限切れ — ポータビリティ期間有効 (残り ${d} 日)`,
    retentionTitle: (d) => `🔒 受動保管中のインスタンス — 保管庫でさらに ${d} 日間保持`,
    graceDesc: '7日以内にサブスクリプションを更新するか、会計および運用データの完全なエクスポートを実行してください。',
    retentionDesc: '7日間の移行期間が終了しました。データベースは完全削除されるまで30日間保管されます。',
    exportBtn: '⬇ データベース出力 (.JSON)',
    payBtn: (amt) => `💳 サブスクリプション更新 (${amt})`,
    suspendedTitle: '運用一時停止 — 保管庫にて保持中',
    suspendedDesc: (c) => `${c} 名のスタッフのアクセス権が一時的に無効化されています。月額料金を支払うとリアルタイムで復旧します。`,
    activeLicenses: '有効なライセンス',
    online: 'オンライン',
    iamTitle: '🔐 認証情報およびアクセス管理 (IAM)',
    iamDesc: (comp) => `スタッフのアカウントを管理します。各オペレーターは ${comp} 内の割り当てられた端末にのみアクセスできます。`,
    phName: 'スタッフ名',
    phEmail: '社内メールアドレス',
    phPass: '仮パスワード',
    roleCashier: 'POSオペレーター',
    roleVendor: 'CRM担当',
    roleCollector: 'ルート集金担当',
    roleSupervisor: '債権スーパーバイザー',
    addBtn: '+ 追加',
    badgeCashier: '💳 POS運用ターミナル',
    badgeVendor: '📈 CRM営業ステーション',
    badgeCollector: '🛵 フィールド集金ルート',
    badgeSupervisor: '📊 債権ポートフォリオ管理',
    accessId: 'アクセスID',
    passLabel: 'パス',
    statusActive: '● 有効 (取消)',
    statusRevoked: '○ 取消済 (有効化)',
  },
  ru: {
    badge: '🏛️ Исполнительная консоль · Администратор',
    ceo: 'Генеральный директор',
    isolatedSession: 'Изолированная корпоративная сессия',
    logoutBtn: 'Выйти из сессии',
    graceTitle: (d) => `⏳ Просрочка оплаты — Окно переноса активно (осталось ${d} дн.)`,
    retentionTitle: (d) => `🔒 Экземпляр на пассивном хранении — В хранилище еще ${d} дн.`,
    graceDesc: 'У вас есть 7 дней для оплаты подписки или полного экспорта учетных и операционных данных.',
    retentionDesc: '7-дневный период переноса истек. База данных будет храниться 30 дней перед окончательным удалением.',
    exportBtn: '⬇ Экспорт базы данных (.JSON)',
    payBtn: (amt) => `💳 Оплатить подписку (${amt})`,
    suspendedTitle: 'Работа приостановлена — Экземпляр в хранилище удержания',
    suspendedDesc: (c) => `Операционный доступ ваших сотрудников (${c}) временно отключен. Оплатите тариф для восстановления работы.`,
    activeLicenses: 'Активные лицензии',
    online: 'В сети',
    iamTitle: '🔐 Управление доступом и учетными данными (IAM)',
    iamDesc: (comp) => `Управляйте аккаунтами персонала. Каждый оператор получает доступ только к своему терминалу внутри ${comp}.`,
    phName: 'Имя сотрудника',
    phEmail: 'Корпоративный email',
    phPass: 'Временный пароль',
    roleCashier: 'Оператор POS',
    roleVendor: 'Менеджер CRM',
    roleCollector: 'Выездной инкассатор',
    roleSupervisor: 'Супервайзер портфеля',
    addBtn: '+ Добавить',
    badgeCashier: '💳 Кассовый терминал POS',
    badgeVendor: '📈 Коммерческая станция CRM',
    badgeCollector: '🛵 Маршрут сбора платежей',
    badgeSupervisor: '📊 Контроль кредитного портфеля',
    accessId: 'ID доступа',
    passLabel: 'Ключ',
    statusActive: '● Активен (Отозвать)',
    statusRevoked: '○ Отозван (Включить)',
  },
  ar: {
    badge: '🏛️ وحدة التحكم التنفيذية · مسؤول المؤسسة',
    ceo: 'المدير العام',
    isolatedSession: 'جلسة مؤسسية معزولة',
    logoutBtn: 'تسجيل الخروج',
    graceTitle: (d) => `⏳ فاتورة متأخرة — نافذة نقل البيانات نشطة (${d} أيام متبقية)`,
    retentionTitle: (d) => `🔒 الحساب في الحفظ السلبي — محفوظ في الخزنة لمدة ${d} يوماً إضافياً`,
    graceDesc: 'لديك 7 أيام لتسوية اشتراكك أو تصدير كامل السجلات المحاسبية والتشغيلية.',
    retentionDesc: 'انتهت فترة النقل البالغة 7 أيام. ستبقى قاعدة البيانات محفوظة لمدة 30 يوماً قبل الحذف النهائي.',
    exportBtn: '⬇ تصدير قاعدة البيانات (.JSON)',
    payBtn: (amt) => `💳 تسوية الاشتراك (${amt})`,
    suspendedTitle: 'العمليات معلقة — الحساب في خزنة الاحتفاظ',
    suspendedDesc: (c) => `تم تعطيل وصول ${c} من موظفيك مؤقتاً. قم بتسوية الرسوم الشهرية لاستعادة الخدمات فوراً.`,
    activeLicenses: 'التراخيص النشطة',
    online: 'متصل',
    iamTitle: '🔐 إدارة بيانات الاعتماد والصلاحيات (IAM)',
    iamDesc: (comp) => `إدارة حسابات الموظفين. سيدخل كل مشغل حصرياً إلى المحطة المخصصة له داخل ${comp}.`,
    phName: 'اسم الموظف',
    phEmail: 'البريد المؤسسي',
    phPass: 'كلمة مرور مؤقتة',
    roleCashier: 'مشغل نقطة بيع POS',
    roleVendor: 'مسؤول مبيعات CRM',
    roleCollector: 'محصل ميداني',
    roleSupervisor: 'مشرف المحفظة',
    addBtn: '+ إضافة',
    badgeCashier: '💳 محطة نقاط البيع POS',
    badgeVendor: '📈 محطة المبيعات CRM',
    badgeCollector: '🛵 مسار التحصيل الميداني',
    badgeSupervisor: '📊 الإشراف على المحفظة',
    accessId: 'معرف الدخول',
    passLabel: 'المفتاح',
    statusActive: '● مفعل (إلغاء)',
    statusRevoked: '○ ملغى (تفعيل)',
  },
  ko: {
    badge: '🏛️ 경영진 관리 콘솔 · 테넌트 관리자',
    ceo: '총괄 대표',
    isolatedSession: '독립된 기업 세션',
    logoutBtn: '세션 로그아웃',
    graceTitle: (d) => `⏳ 결제 연체 — 데이터 이전 기간 활성화 (${d}일 남음)`,
    retentionTitle: (d) => `🔒 수동 보관 상태 — 보관소에서 ${d}일 추가 유지`,
    graceDesc: '7일 이내에 구독료를 결제하거나 회계 및 운영 기록 전체를 내보낼 수 있습니다.',
    retentionDesc: '7일간의 이전 기간이 종료되었습니다. 데이터베이스는 영구 삭제 전 30일 동안 보관됩니다.',
    exportBtn: '⬇ 데이터베이스 내보내기 (.JSON)',
    payBtn: (amt) => `💳 구독 정상화 (${amt})`,
    suspendedTitle: '운영 일시 중지 — 보관소에 격리됨',
    suspendedDesc: (c) => `${c}명의 직원 계정 접근이 일시적으로 비활성화되었습니다. 월 요금을 결제하면 즉시 복구됩니다.`,
    activeLicenses: '활성 라이선스',
    online: '온라인',
    iamTitle: '🔐 자격 증명 및 접근 관리 (IAM)',
    iamDesc: (comp) => `직원 운영 계정을 관리합니다. 각 작업자는 ${comp} 내 지정된 단말기에만 접근할 수 있습니다.`,
    phName: '직원 이름',
    phEmail: '사내 이메일',
    phPass: '임시 비밀번호',
    roleCashier: 'POS 오퍼레이터',
    roleVendor: 'CRM 담당자',
    roleCollector: '현장 수금원',
    roleSupervisor: '채권 슈퍼바이저',
    addBtn: '+ 등록',
    badgeCashier: '💳 POS 운영 단말기',
    badgeVendor: '📈 CRM 영업 스테이션',
    badgeCollector: '🛵 현장 수금 루트',
    badgeSupervisor: '📊 채권 포트폴리오 감독',
    accessId: '접속 ID',
    passLabel: '비밀번호',
    statusActive: '● 활성 (철회)',
    statusRevoked: '○ 철회됨 (활성화)',
  },
  hi: {
    badge: '🏛️ कार्यकारी प्रबंधन कंसोल · टेनेंट एडमिन',
    ceo: 'महानिदेशक',
    isolatedSession: 'पृथक कॉर्पोरेट सत्र',
    logoutBtn: 'सत्र लॉग आउट करें',
    graceTitle: (d) => `⏳ बिलिंग अतिदेय — पोर्टेबिलिटी विंडो सक्रिय (${d} दिन शेष)`,
    retentionTitle: (d) => `🔒 निष्क्रिय कस्टडी में इंस्टेंस — वॉल्ट में ${d} अतिरिक्त दिनों के लिए सुरक्षित`,
    graceDesc: 'अपनी सदस्यता को नियमित करने या अपने पूर्ण रिकॉर्ड निर्यात करने के लिए आपके पास 7 दिन हैं।',
    retentionDesc: '7-दिवसीय पोर्टेबिलिटी अवधि समाप्त हो गई है। स्थायी विलोपन से पहले डेटाबेस 30 दिनों तक सुरक्षित रहेगा।',
    exportBtn: '⬇ डेटाबेस निर्यात करें (.JSON)',
    payBtn: (amt) => `💳 सदस्यता नियमित करें (${amt})`,
    suspendedTitle: 'संचालन निलंबित — रिटेंशन वॉल्ट में इंस्टेंस',
    suspendedDesc: (c) => `आपके ${c} कर्मचारियों की परिचालन पहुंच अस्थायी रूप से अक्षम है। सेवाएं बहाल करने के लिए मासिक शुल्क का भुगतान करें।`,
    activeLicenses: 'सक्रिय लाइसेंस',
    online: 'ऑनलाइन',
    iamTitle: '🔐 क्रेडेंशियल और एक्सेस प्रबंधन (IAM)',
    iamDesc: (comp) => `अपने कर्मचारियों के खातों का प्रबंधन करें। प्रत्येक ऑपरेटर केवल ${comp} के भीतर आवंटित टर्मिनल तक पहुंचेगा।`,
    phName: 'कर्मचारी का नाम',
    phEmail: 'कॉर्पोरेट ईमेल',
    phPass: 'अस्थायी पासवर्ड',
    roleCashier: 'POS ऑपरेटर',
    roleVendor: 'CRM एग्जीक्यूटिव',
    roleCollector: 'फील्ड कलेक्टर',
    roleSupervisor: 'पोर्टफोलियो सुपरवाइजर',
    addBtn: '+ जोड़ें',
    badgeCashier: '💳 POS टर्मिनल',
    badgeVendor: '📈 CRM कमर्शियल स्टेशन',
    badgeCollector: '🛵 फील्ड कलेक्शन रूट',
    badgeSupervisor: '📊 पोर्टफोलियो पर्यवेक्षण',
    accessId: 'एक्सेस ID',
    passLabel: 'कुंजी',
    statusActive: '● सक्षम (रद्द करें)',
    statusRevoked: '○ रद्द (सक्षम करें)',
  },
};

export default function ExecutiveConsolePage() {
  const router = useRouter();
  const { lang, t, country, formatMoney } = useLanguage();
  const ui = OWNER_TEXTS[lang] || OWNER_TEXTS.es;

  const {
    loaded,
    session,
    companies,
    workers,
    logout,
    addWorkerToCompany,
    toggleWorkerStatus,
    updateCompanyOverdue,
  } = useVeltrixAuth();

  const [wName, setWName] = useState('');
  const [wEmail, setWEmail] = useState('');
  const [wPass, setWPass] = useState('');
  const [wRole, setWRole] = useState<'cashier' | 'vendor' | 'collector' | 'supervisor'>('cashier');

  useEffect(() => {
    if (loaded && (!session || session.role !== 'owner')) {
      router.replace('/');
    }
  }, [loaded, session, router]);

  if (!loaded || !session || session.role !== 'owner') {
    return <div className="min-h-screen bg-slate-950" />;
  }

  const myCompany = companies.find((c) => c.id === session.companyId);
  if (!myCompany) return null;

  const myWorkers = workers.filter((w) => w.companyId === myCompany.id);
  const isActive = myCompany.daysOverdue === 0;
  const isGrace = myCompany.daysOverdue >= 1 && myCompany.daysOverdue <= 7;
  const isRetention = myCompany.daysOverdue >= 8;
  const graceDaysLeft = Math.max(0, 7 - myCompany.daysOverdue);
  const retentionDaysLeft = Math.max(0, 30 - myCompany.daysOverdue);

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim() || !wEmail.trim() || !wPass.trim()) return;
    addWorkerToCompany({
      companyId: myCompany.id,
      name: wName.trim(),
      email: wEmail.trim(),
      password: wPass.trim(),
      role: wRole,
    });
    setWName('');
    setWEmail('');
    setWPass('');
  };

  const handleExportData = () => {
    const backupPayload = {
      organization: myCompany,
      iamAccounts: myWorkers,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_corporativo_${myCompany.taxId}.json`;
    a.click();
  };

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
                {ui.badge}
              </span>
              <span className="text-xs text-slate-400">
                {country.taxIdName}: <strong className="text-slate-200">{myCompany.taxId}</strong>
              </span>
            </div>
            <h1 className="text-3xl font-extrabold mt-2">{myCompany.name}</h1>
            <p className="text-xs text-slate-400 mt-1">
              {ui.ceo}: <strong className="text-white">{myCompany.ownerName}</strong> · {ui.isolatedSession}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <LanguageDropdown />
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg transition cursor-pointer"
            >
              {ui.logoutBtn}
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        {!isActive && (
          <div
            className={`p-5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
              isGrace ? 'bg-amber-950/20 border-amber-500/50' : 'bg-red-950/30 border-red-500/50'
            }`}
          >
            <div className="space-y-1">
              <h3 className="font-bold text-base">
                {isGrace ? ui.graceTitle(graceDaysLeft) : ui.retentionTitle(retentionDaysLeft)}
              </h3>
              <p className="text-xs text-slate-300">
                {isGrace ? ui.graceDesc : ui.retentionDesc}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {isGrace && (
                <button
                  onClick={handleExportData}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-lg transition cursor-pointer"
                >
                  {ui.exportBtn}
                </button>
              )}
              <button
                onClick={() => updateCompanyOverdue(myCompany.id, 0)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition cursor-pointer"
              >
                {ui.payBtn(formatMoney(myCompany.plan))}
              </button>
            </div>
          </div>
        )}

        {isRetention ? (
          <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <p className="text-lg font-bold text-red-400">{ui.suspendedTitle}</p>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              {ui.suspendedDesc(myWorkers.length)}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-base">{ui.activeLicenses}</h2>
                  <span className="text-xs font-bold text-emerald-400">
                    {formatMoney(myCompany.plan)}/{t.perMonth}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {myCompany.modules.map((m) => (
                    <div
                      key={m}
                      className="p-3.5 rounded-xl bg-slate-950 border border-blue-500/30 flex justify-between items-center"
                    >
                      <span className="text-sm font-semibold text-blue-300">✓ {m}</span>
                      <span className="text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">
                        {ui.online}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold">{ui.iamTitle}</h2>
                  <p className="text-xs text-slate-400">{ui.iamDesc(myCompany.name)}</p>
                </div>

                <form
                  onSubmit={handleAddStaff}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs"
                >
                  <input
                    type="text"
                    required
                    placeholder={ui.phName}
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <input
                    type="email"
                    required
                    placeholder={ui.phEmail}
                    value={wEmail}
                    onChange={(e) => setWEmail(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder={ui.phPass}
                    value={wPass}
                    onChange={(e) => setWPass(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <div className="flex gap-2">
                    <select
                      value={wRole}
                      onChange={(e) =>
                        setWRole(e.target.value as 'cashier' | 'vendor' | 'collector' | 'supervisor')
                      }
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white flex-1"
                    >
                      <option value="cashier">{ui.roleCashier}</option>
                      <option value="vendor">{ui.roleVendor}</option>
                      <option value="collector">{ui.roleCollector}</option>
                      <option value="supervisor">{ui.roleSupervisor}</option>
                    </select>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-2 rounded-lg cursor-pointer"
                    >
                      {ui.addBtn}
                    </button>
                  </div>
                </form>

                <div className="space-y-2.5">
                  {myWorkers.map((w) => (
                    <div
                      key={w.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-sm text-white">
                          {w.name}{' '}
                          <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 ml-2">
                            {w.role === 'cashier' && ui.badgeCashier}
                            {w.role === 'vendor' && ui.badgeVendor}
                            {w.role === 'collector' && ui.badgeCollector}
                            {w.role === 'supervisor' && ui.badgeSupervisor}
                          </span>
                        </p>
                        <p className="text-slate-400 mt-0.5">
                          {ui.accessId}: <strong className="text-slate-200">{w.email}</strong> · {ui.passLabel}:{' '}
                          <strong className="text-slate-200">{w.password}</strong>
                        </p>
                      </div>
                      <button
                        onClick={() => toggleWorkerStatus(w.id)}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          w.active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {w.active ? ui.statusActive : ui.statusRevoked}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
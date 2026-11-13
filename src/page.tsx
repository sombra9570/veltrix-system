'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useLanguage,
  LanguageDropdown,
  RegionalStatusBar,
  LangCode,
} from './language-selector';
import { useVeltrixAuth, UserRole } from './auth-system';

interface ModuleItem {
  id: 'crm' | 'pos' | 'credit' | 'hr' | 'routes' | 'audit';
  priceUsd: number;
  icon: string;
  color: string;
}

const CORE_MODULES: ModuleItem[] = [
  { id: 'crm', priceUsd: 29, icon: '📈', color: 'cyan' },
  { id: 'pos', priceUsd: 39, icon: '💳', color: 'emerald' },
  { id: 'credit', priceUsd: 49, icon: '🏦', color: 'amber' },
  { id: 'hr', priceUsd: 25, icon: '👥', color: 'purple' },
  { id: 'routes', priceUsd: 35, icon: '🛵', color: 'blue' },
  { id: 'audit', priceUsd: 45, icon: '📊', color: 'rose' },
];

const PAGE_I18N: Record<
  LangCode,
  {
    heroSubtitle: string;
    activeModulesCount: string;
    includedInPlan: string;
    clickToToggle: string;
    routesTitle: string;
    routesDesc: string;
    auditTitle: string;
    auditDesc: string;
    architectureTitle: string;
    orgLevel: string;
    orgDesc: string;
    compLevel: string;
    compDesc: string;
    branchLevel: string;
    branchDesc: string;
    posRouteLevel: string;
    posRouteDesc: string;
    iamTitle: string;
    iamSubtitle: string;
    emailLabel: string;
    passLabel: string;
    loginBtn: string;
    validating: string;
    quickAccessTitle: string;
    quickAccessDesc: string;
    roleSuperAdmin: string;
    roleOwner: string;
    roleCashier: string;
    roleVendor: string;
    roleCollector: string;
    roleSupervisor: string;
    registerCompanyTitle: string;
    registerCompanyDesc: string;
    compNamePh: string;
    taxIdPh: string;
    ownerNamePh: string;
    ownerEmailPh: string;
    ownerPassPh: string;
    sectorRetail: string;
    sectorDistribution: string;
    sectorFinance: string;
    sectorServices: string;
    createTenantBtn: string;
    branchesLabel: string;
    routesCountLabel: string;
    registersCountLabel: string;
    enterConsoleBtn: string;
    daysOverdueLabel: string;
    upToDate: string;
    gracePeriodBadge: string;
    vaultBadge: string;
    footerText: string;
  }
> = {
  es: {
    heroSubtitle:
      'Arquitectura Multi-Tenant Jerárquica: Organización → Empresa → Sucursal → Caja / Turno y Rutas de Cobranza.',
    activeModulesCount: 'módulos activos',
    includedInPlan: 'Activo en Suscripción',
    clickToToggle: 'Clic para activar/desactivar',
    routesTitle: 'Rutas de Cobranza en Calle',
    routesDesc: 'Itinerarios por zona, cobros QR/Efectivo, operación offline y rendición diaria.',
    auditTitle: 'Supervisión y Auditoría de Cartera',
    auditDesc: 'Control de morosidad por sucursal, arqueo de cobradores y aprobación de créditos.',
    architectureTitle: 'Estructura Corporativa Desglosada (Sin Mezclar Operaciones)',
    orgLevel: '1. Organización & Empresa',
    orgDesc: 'Entidad legal con NIT/ID fiscal propio, régimen tributario, moneda contable y licencias.',
    compLevel: '2. Sucursales Independientes',
    compDesc: 'Cada establecimiento controla su horario, inventario local, personal y facturación.',
    branchLevel: '3. Cajas y Turnos POS',
    branchDesc: 'Apertura, cobro en mostrador y arqueo ciego separado por cajero y punto de venta.',
    posRouteLevel: '4. Rutas y Supervisión de Cartera',
    posRouteDesc: 'Cobranza de campo geolocalizada, sincronización offline y conciliación por supervisor.',
    iamTitle: 'Pasarela de Autenticación (IAM)',
    iamSubtitle: 'Ingrese a su estación de trabajo según el rol asignado en su empresa o sucursal.',
    emailLabel: 'Correo Institucional',
    passLabel: 'Clave de Seguridad',
    loginBtn: '🔓 Entrar al Sistema',
    validating: 'Verificando...',
    quickAccessTitle: '⚡ Accesos Directos por Rol Jerárquico',
    quickAccessDesc: 'Seleccione un perfil para autocompletar credenciales y probar su módulo aislado:',
    roleSuperAdmin: '🛡️ Súper Admin (Control Global de Plataforma)',
    roleOwner: '🏛️ Dueño / Director (Consola Ejecutiva & Sucursales)',
    roleCashier: '💳 Cajero POS (Terminal de Caja & Turno)',
    roleVendor: '📈 Ejecutivo CRM (Prospección & Cotizaciones)',
    roleCollector: '🛵 Cobrador de Ruta (Cobranza en Calle & Offline)',
    roleSupervisor: '📊 Supervisor de Cartera (Auditoría de Rutas & Mora)',
    registerCompanyTitle: 'Alta de Nueva Organización / Empresa en el Ecosistema',
    registerCompanyDesc: 'Despliegue una instancia aislada con los módulos seleccionados arriba.',
    compNamePh: 'Razón Social / Nombre de la Empresa',
    taxIdPh: 'Número Fiscal',
    ownerNamePh: 'Nombre del Director / Dueño',
    ownerEmailPh: 'correo@empresa.com',
    ownerPassPh: 'Contraseña maestra',
    sectorRetail: 'Comercio & Retail / Ferretería',
    sectorDistribution: 'Distribución Mayorista & Rutas',
    sectorFinance: 'Microfinanzas & Cartera de Crédito',
    sectorServices: 'Gastronomía & Servicios',
    createTenantBtn: '+ Desplegar Empresa Ahora',
    branchesLabel: 'Sucursales',
    routesCountLabel: 'Rutas Activas',
    registersCountLabel: 'Cajas POS',
    enterConsoleBtn: 'Abrir Consola →',
    daysOverdueLabel: 'Días de mora',
    upToDate: 'Al día (Automático)',
    gracePeriodBadge: 'Portabilidad (7d)',
    vaultBadge: 'En Bóveda (Suspendido)',
    footerText: 'Veltrix System © 2026 — ERP Multi-Tenant con Sincronización Cambiaria y Fiscal.',
  },
  en: {
    heroSubtitle:
      'Hierarchical Multi-Tenant Architecture: Organization → Company → Branch → Register / Shift & Collection Routes.',
    activeModulesCount: 'active modules',
    includedInPlan: 'Active in Subscription',
    clickToToggle: 'Click to toggle module',
    routesTitle: 'Field Collection Routes',
    routesDesc: 'Zone itineraries, QR/Cash collections, offline sync, and daily settlement.',
    auditTitle: 'Portfolio Supervision & Audit',
    auditDesc: 'Branch delinquency control, collector reconciliation, and credit approvals.',
    architectureTitle: 'Unbundled Corporate Hierarchy (Zero Mixed Operations)',
    orgLevel: '1. Organization & Legal Entity',
    orgDesc: 'Legal company with its own Tax ID, tax regime, accounting currency, and licenses.',
    compLevel: '2. Independent Branches',
    compDesc: 'Each location manages its own timezone, local inventory, staff, and billing.',
    branchLevel: '3. POS Registers & Shifts',
    branchDesc: 'Shift opening, counter checkout, and blind cash count isolated per cashier.',
    posRouteLevel: '4. Field Routes & Portfolio Supervision',
    posRouteDesc: 'Field collection, offline queue sync, and supervisor reconciliation.',
    iamTitle: 'Corporate Authentication Gateway (IAM)',
    iamSubtitle: 'Sign in to your workstation according to your assigned company and branch role.',
    emailLabel: 'Corporate Email',
    passLabel: 'Security Password',
    loginBtn: '🔓 Sign In to System',
    validating: 'Validating...',
    quickAccessTitle: '⚡ Quick Role Hierarchy Demo Access',
    quickAccessDesc: 'Click any profile to autofill credentials and test its isolated workstation:',
    roleSuperAdmin: '🛡️ Super Admin (Global Platform Control)',
    roleOwner: '🏛️ Owner / CEO (Executive Console & Branches)',
    roleCashier: '💳 POS Cashier (Register Terminal & Shift)',
    roleVendor: '📈 CRM Executive (Pipeline & Quotations)',
    roleCollector: '🛵 Field Collector (Street Route & Offline Sync)',
    roleSupervisor: '📊 Portfolio Supervisor (Route Audit & Delinquency)',
    registerCompanyTitle: 'Deploy New Organization / Company in Ecosystem',
    registerCompanyDesc: 'Provision an isolated tenant instance with the modules selected above.',
    compNamePh: 'Legal Company Name',
    taxIdPh: 'Tax ID Number',
    ownerNamePh: 'Director / Owner Full Name',
    ownerEmailPh: 'owner@company.com',
    ownerPassPh: 'Master password',
    sectorRetail: 'Retail & Hardware Store',
    sectorDistribution: 'Wholesale Distribution & Routes',
    sectorFinance: 'Microfinance & Credit Portfolio',
    sectorServices: 'Hospitality & Services',
    createTenantBtn: '+ Deploy Company Now',
    branchesLabel: 'Branches',
    routesCountLabel: 'Active Routes',
    registersCountLabel: 'POS Registers',
    enterConsoleBtn: 'Open Console →',
    daysOverdueLabel: 'Days overdue',
    upToDate: 'Current (Auto-Billing)',
    gracePeriodBadge: 'Portability (7d)',
    vaultBadge: 'In Vault (Suspended)',
    footerText: 'Veltrix System © 2026 — Multi-Tenant ERP with Live FX & Tax Synchronization.',
  },
  it: {
    heroSubtitle:
      'Architettura Multi-Tenant Gerarchica: Organizzazione → Azienda → Filiale → Cassa / Turno e Riscossione.',
    activeModulesCount: 'moduli attivi',
    includedInPlan: 'Attivo nell\'Abbonamento',
    clickToToggle: 'Clicca per attivare/disattivare',
    routesTitle: 'Percorsi di Riscossione su Strada',
    routesDesc: 'Itinerari per zona, incassi QR/Contanti, modalità offline e resa giornaliera.',
    auditTitle: 'Supervisione e Audit del Portafoglio',
    auditDesc: 'Controllo morosità per filiale, quadratura esattori e approvazione crediti.',
    architectureTitle: 'Gerarchia Aziendale Separata (Nessuna Operazione Mista)',
    orgLevel: '1. Organizzazione e Azienda',
    orgDesc: 'Entità legale con Partita IVA, regime fiscale, valuta contabile e licenze.',
    compLevel: '2. Filiali Indipendenti',
    compDesc: 'Ogni sede gestisce fuso orario, inventario locale, personale e fatturazione.',
    branchLevel: '3. Casse e Turni POS',
    branchDesc: 'Apertura turno, incasso al banco e chiusura cassa separati per cassiere.',
    posRouteLevel: '4. Percorsi e Supervisione Crediti',
    posRouteDesc: 'Riscossione sul campo, sincronizzazione offline e riconciliazione supervisore.',
    iamTitle: 'Gateway di Autenticazione (IAM)',
    iamSubtitle: 'Accedi alla tua postazione in base al ruolo assegnato nella tua azienda o filiale.',
    emailLabel: 'Email Aziendale',
    passLabel: 'Password di Sicurezza',
    loginBtn: '🔓 Accedi al Sistema',
    validating: 'Verifica in corso...',
    quickAccessTitle: '⚡ Accessi Rapidi per Ruolo Gerarchico',
    quickAccessDesc: 'Seleziona un profilo per compilare le credenziali e testare il modulo isolato:',
    roleSuperAdmin: '🛡️ Super Admin (Controllo Globale Piattaforma)',
    roleOwner: '🏛️ Titolare / Direttore (Console Esecutiva e Filiali)',
    roleCashier: '💳 Cassiere POS (Terminale Cassa e Turno)',
    roleVendor: '📈 Consulente CRM (Trattative e Preventivi)',
    roleCollector: '🛵 Esattore su Strada (Riscossione e Offline)',
    roleSupervisor: '📊 Supervisore Portafoglio (Audit Percorsi e Mora)',
    registerCompanyTitle: 'Nuova Organizzazione / Azienda nell\'Ecosistema',
    registerCompanyDesc: 'Attiva un\'istanza isolata con i moduli selezionati sopra.',
    compNamePh: 'Ragione Sociale / Nome Azienda',
    taxIdPh: 'Codice Fiscale / P.IVA',
    ownerNamePh: 'Nome Direttore / Titolare',
    ownerEmailPh: 'titolare@azienda.it',
    ownerPassPh: 'Password principale',
    sectorRetail: 'Commercio & Retail / Ferramenta',
    sectorDistribution: 'Distribuzione Ingrosso & Consegne',
    sectorFinance: 'Microfinanza & Credito',
    sectorServices: 'Ristorazione & Servizi',
    createTenantBtn: '+ Attiva Azienda Ora',
    branchesLabel: 'Filiali',
    routesCountLabel: 'Percorsi Attivi',
    registersCountLabel: 'Casse POS',
    enterConsoleBtn: 'Apri Console →',
    daysOverdueLabel: 'Giorni di mora',
    upToDate: 'Regolare (Auto)',
    gracePeriodBadge: 'Portabilità (7g)',
    vaultBadge: 'In Caveau (Sospeso)',
    footerText: 'Veltrix System © 2026 — ERP Multi-Tenant con Sincronizzazione Valute e Fisco.',
  },
  pt: {
    heroSubtitle:
      'Arquitetura Multi-Tenant Hierárquica: Organização → Empresa → Filial → Caixa / Turno e Rotas de Cobrança.',
    activeModulesCount: 'módulos ativos',
    includedInPlan: 'Ativo na Assinatura',
    clickToToggle: 'Clique para ativar/desativar',
    routesTitle: 'Rotas de Cobrança em Campo',
    routesDesc: 'Roteiros por zona, recebimentos PIX/QR/Dinheiro, modo offline e prestação de contas.',
    auditTitle: 'Supervisão e Auditoria de Carteira',
    auditDesc: 'Controle de inadimplência por filial, conferência de cobradores e aprovação de crédito.',
    architectureTitle: 'Estrutura Corporativa Desmembrada (Sem Misturar Operações)',
    orgLevel: '1. Organização e Empresa',
    orgDesc: 'Entidade legal com CNPJ/ID fiscal próprio, regime tributário, moeda e licenças.',
    compLevel: '2. Filiais Independentes',
    compDesc: 'Cada estabelecimento controla seu horário, estoque local, equipe e faturamento.',
    branchLevel: '3. Caixas e Turnos PDV',
    branchDesc: 'Abertura, venda no balcão e fechamento de caixa isolados por operador.',
    posRouteLevel: '4. Rotas e Supervisão de Carteira',
    posRouteDesc: 'Cobrança externa, sincronização offline e conciliação pelo supervisor.',
    iamTitle: 'Gateway de Autenticação (IAM)',
    iamSubtitle: 'Acesse sua estação de trabalho conforme o cargo atribuído na sua empresa ou filial.',
    emailLabel: 'E-mail Corporativo',
    passLabel: 'Senha de Segurança',
    loginBtn: '🔓 Entrar no Sistema',
    validating: 'Validando...',
    quickAccessTitle: '⚡ Acessos Rápidos por Cargo Hierárquico',
    quickAccessDesc: 'Clique em um perfil para preencher as credenciais e testar seu módulo isolado:',
    roleSuperAdmin: '🛡️ Super Admin (Controle Global da Plataforma)',
    roleOwner: '🏛️ Proprietário / Diretor (Console Executivo e Filiais)',
    roleCashier: '💳 Operador PDV (Terminal de Caixa e Turno)',
    roleVendor: '📈 Executivo CRM (Funil e Orçamentos)',
    roleCollector: '🛵 Cobrador de Rota (Cobrança na Rua e Offline)',
    roleSupervisor: '📊 Supervisor de Carteira (Auditoria de Rotas e Mora)',
    registerCompanyTitle: 'Cadastro de Nova Organização / Empresa no Ecossistema',
    registerCompanyDesc: 'Implante uma instância isolada com os módulos selecionados acima.',
    compNamePh: 'Razão Social / Nome da Empresa',
    taxIdPh: 'CNPJ / ID Fiscal',
    ownerNamePh: 'Nome do Diretor / Proprietário',
    ownerEmailPh: 'diretor@empresa.com',
    ownerPassPh: 'Senha mestra',
    sectorRetail: 'Comércio & Varejo / Materiais',
    sectorDistribution: 'Distribuição Atacadista & Rotas',
    sectorFinance: 'Microfinanças & Carteira de Crédito',
    sectorServices: 'Gastronomia & Serviços',
    createTenantBtn: '+ Implantar Empresa Agora',
    branchesLabel: 'Filiais',
    routesCountLabel: 'Rotas Ativas',
    registersCountLabel: 'Caixas PDV',
    enterConsoleBtn: 'Abrir Console →',
    daysOverdueLabel: 'Dias em atraso',
    upToDate: 'Em dia (Automático)',
    gracePeriodBadge: 'Portabilidade (7d)',
    vaultBadge: 'No Cofre (Suspenso)',
    footerText: 'Veltrix System © 2026 — ERP Multi-Tenant com Sincronização Cambial e Fiscal.',
  },
  fr: {
    heroSubtitle:
      'Architecture Multi-Tenant Hiérarchique : Organisation → Entreprise → Succursale → Caisse / Poste & Tournées.',
    activeModulesCount: 'modules actifs',
    includedInPlan: 'Actif dans l\'Abonnement',
    clickToToggle: 'Cliquez pour activer/désactiver',
    routesTitle: 'Tournées de Recouvrement Terrain',
    routesDesc: 'Itinéraires par zone, encaissements QR/Espèces, mode hors-ligne et reddition.',
    auditTitle: 'Supervision et Audit de Portefeuille',
    auditDesc: 'Contrôle des impayés par succursale, arrêté des encaisseurs et validation crédit.',
    architectureTitle: 'Hiérarchie Corporative Découpée (Zéro Opération Mélangée)',
    orgLevel: '1. Organisation & Entreprise',
    orgDesc: 'Entité légale avec SIRET/ID fiscal, régime TVA, devise comptable et licences.',
    compLevel: '2. Succursales Indépendantes',
    compDesc: 'Chaque établissement gère son fuseau horaire, stock local, personnel et facturation.',
    branchLevel: '3. Caisses et Postes PDV',
    branchDesc: 'Ouverture, encaissement comptoir et clôture de caisse isolés par caissier.',
    posRouteLevel: '4. Tournées & Supervision Portefeuille',
    posRouteDesc: 'Recouvrement terrain, synchronisation hors-ligne et rapprochement superviseur.',
    iamTitle: 'Portail d\'Authentification (IAM)',
    iamSubtitle: 'Connectez-vous à votre poste selon le rôle attribué dans votre succursale.',
    emailLabel: 'E-mail Professionnel',
    passLabel: 'Mot de Passe',
    loginBtn: '🔓 Se Connecter',
    validating: 'Validation...',
    quickAccessTitle: '⚡ Accès Rapides par Rôle Hiérarchique',
    quickAccessDesc: 'Cliquez sur un profil pour remplir les identifiants et tester son module isolé :',
    roleSuperAdmin: '🛡️ Super Admin (Contrôle Global Plateforme)',
    roleOwner: '🏛️ Dirigeant / Propriétaire (Console Exécutive & Succursales)',
    roleCashier: '💳 Caissier PDV (Terminal Caisse & Poste)',
    roleVendor: '📈 Exécutif CRM (Pipeline & Devis)',
    roleCollector: '🛵 Agent de Recouvrement (Tournée Terrain & Hors-ligne)',
    roleSupervisor: '📊 Superviseur Portefeuille (Audit Tournées & Impayés)',
    registerCompanyTitle: 'Nouvelle Organisation / Entreprise dans l\'Écosystème',
    registerCompanyDesc: 'Déployez une instance isolée avec les modules sélectionnés ci-dessus.',
    compNamePh: 'Raison Sociale / Nom de l\'Entreprise',
    taxIdPh: 'Numéro SIRET / ID Fiscal',
    ownerNamePh: 'Nom du Dirigeant',
    ownerEmailPh: 'dirigeant@entreprise.fr',
    ownerPassPh: 'Mot de passe maître',
    sectorRetail: 'Commerce & Détail / Quincaillerie',
    sectorDistribution: 'Distribution Grossiste & Tournées',
    sectorFinance: 'Microfinance & Portefeuille Crédit',
    sectorServices: 'Restauration & Services',
    createTenantBtn: '+ Déployer l\'Entreprise',
    branchesLabel: 'Succursales',
    routesCountLabel: 'Tournées Actives',
    registersCountLabel: 'Caisses PDV',
    enterConsoleBtn: 'Ouvrir Console →',
    daysOverdueLabel: 'Jours de retard',
    upToDate: 'À jour (Automatique)',
    gracePeriodBadge: 'Portabilité (7j)',
    vaultBadge: 'En Coffre (Suspendu)',
    footerText: 'Veltrix System © 2026 — ERP Multi-Tenant avec Synchronisation Devises & Taxes.',
  },
  de: {
    heroSubtitle:
      'Hierarchische Multi-Tenant-Architektur: Organisation → Unternehmen → Filiale → Kasse / Schicht & Inkassorouten.',
    activeModulesCount: 'aktive Module',
    includedInPlan: 'Im Abonnement Aktiv',
    clickToToggle: 'Klicken zum Aktivieren/Deaktivieren',
    routesTitle: 'Außendienst-Inkassorouten',
    routesDesc: 'Gebietsrouten, QR-/Barinkasso, Offline-Betrieb und Tagesabrechnung.',
    auditTitle: 'Portfolio-Überwachung & Prüfung',
    auditDesc: 'Mahnwesen pro Filiale, Abrechnung der Inkassomitarbeiter und Kreditfreigabe.',
    architectureTitle: 'Getrennte Unternehmenshierarchie (Keine Gemischten Vorgänge)',
    orgLevel: '1. Organisation & Unternehmen',
    orgDesc: 'Rechtsträger mit eigener Steuer-ID, Steuerregime, Buchungswährung und Lizenzen.',
    compLevel: '2. Unabhängige Filialen',
    compDesc: 'Jeder Standort verwaltet Zeitzone, lokales Inventar, Personal und Abrechnung.',
    branchLevel: '3. POS-Kassen & Schichten',
    branchDesc: 'Schichteröffnung, Thekenverkauf und Kassensturz getrennt nach Kassierer.',
    posRouteLevel: '4. Routen & Portfolio-Supervision',
    posRouteDesc: 'Außendienst-Inkasso, Offline-Synchronisierung und Supervisor-Abstimmung.',
    iamTitle: 'Authentifizierungs-Gateway (IAM)',
    iamSubtitle: 'Melden Sie sich gemäß Ihrer Rolle in Ihrem Unternehmen oder Ihrer Filiale an.',
    emailLabel: 'Firmen-E-Mail',
    passLabel: 'Sicherheitspasswort',
    loginBtn: '🔓 Im System Anmelden',
    validating: 'Prüfung...',
    quickAccessTitle: '⚡ Schnellzugriff nach Hierarchierolle',
    quickAccessDesc: 'Klicken Sie auf ein Profil, um Zugangsdaten einzufügen und das Modul zu testen:',
    roleSuperAdmin: '🛡️ Super Admin (Globale Plattformkontrolle)',
    roleOwner: '🏛️ Inhaber / Geschäftsführer (Konsole & Filialen)',
    roleCashier: '💳 POS-Kassierer (Kassenterminal & Schicht)',
    roleVendor: '📈 CRM-Berater (Pipeline & Angebote)',
    roleCollector: '🛵 Außendienst-Inkasso (Straßenroute & Offline)',
    roleSupervisor: '📊 Portfolio-Supervisor (Routenprüfung & Mahnwesen)',
    registerCompanyTitle: 'Neues Unternehmen im Ökosystem Registrieren',
    registerCompanyDesc: 'Stellen Sie eine isolierte Instanz mit den oben gewählten Modulen bereit.',
    compNamePh: 'Firmenname / Gesellschaft',
    taxIdPh: 'Steuernummer / USt-IdNr',
    ownerNamePh: 'Name des Geschäftsführers',
    ownerEmailPh: 'inhaber@firma.de',
    ownerPassPh: 'Master-Passwort',
    sectorRetail: 'Einzelhandel & Eisenwaren',
    sectorDistribution: 'Großhandel & Lieferrouten',
    sectorFinance: 'Mikrofinanz & Kreditportfolio',
    sectorServices: 'Gastronomie & Dienstleistungen',
    createTenantBtn: '+ Unternehmen Bereitstellen',
    branchesLabel: 'Filialen',
    routesCountLabel: 'Aktive Routen',
    registersCountLabel: 'POS-Kassen',
    enterConsoleBtn: 'Konsole Öffnen →',
    daysOverdueLabel: 'Tage überfällig',
    upToDate: 'Aktuell (Automatisch)',
    gracePeriodBadge: 'Portabilität (7T)',
    vaultBadge: 'Im Tresor (Gesperrt)',
    footerText: 'Veltrix System © 2026 — Multi-Tenant-ERP mit Währungs- und Steuersynchronisation.',
  },
  zh: {
    heroSubtitle: '分层多租户架构：组织 → 企业 → 分店 → 收银台/班次 与 外勤催收路线。',
    activeModulesCount: '个已启用模块',
    includedInPlan: '订阅中已启用',
    clickToToggle: '点击启用/停用模块',
    routesTitle: '外勤催收路线',
    routesDesc: '按区域规划行程、二维码/现金收款、离线操作及每日交账。',
    auditTitle: '账款组合监管与审计',
    auditDesc: '按分店控制逾期账款、催收员对账及信贷审批。',
    architectureTitle: '分层企业架构（各层级独立核算，绝不混杂）',
    orgLevel: '1. 组织与法人企业',
    orgDesc: '具备独立税号、税收制度、记账本位币和许可证的法律实体。',
    compLevel: '2. 独立运营分店',
    compDesc: '各分店独立管理时区、本地库存、员工及开票。',
    branchLevel: '3. POS 收银台与班次',
    branchDesc: '按收银员和终端隔离的开班、柜台收银及盲盘交班。',
    posRouteLevel: '4. 外勤路线与账款监管',
    posRouteDesc: '外勤实地催收、离线同步及主管对账审核。',
    iamTitle: '企业身份认证网关 (IAM)',
    iamSubtitle: '根据您在企业或分店中分配的角色登录专属工作站。',
    emailLabel: '企业邮箱',
    passLabel: '安全密码',
    loginBtn: '🔓 登录系统',
    validating: '验证中...',
    quickAccessTitle: '⚡ 按层级角色快速体验',
    quickAccessDesc: '点击任一角色自动填入凭证并测试其独立工作台：',
    roleSuperAdmin: '🛡️ 超级管理员 (平台全局控制)',
    roleOwner: '🏛️ 企业主 / 总经理 (高管控制台与分店明细)',
    roleCashier: '💳 POS 收银员 (收银终端与班次)',
    roleVendor: '📈 CRM 销售顾问 (销售漏斗与报价)',
    roleCollector: '🛵 外勤催收员 (街道催收路线与离线同步)',
    roleSupervisor: '📊 账款主管 (路线审计与逾期管理)',
    registerCompanyTitle: '在生态系统中部署新企业',
    registerCompanyDesc: '使用上方选定的模块创建独立的企业租户实例。',
    compNamePh: '企业法定名称',
    taxIdPh: '税务登记号',
    ownerNamePh: '总经理 / 企业主姓名',
    ownerEmailPh: 'owner@company.com',
    ownerPassPh: '管理员密码',
    sectorRetail: '商业零售 / 五金建材',
    sectorDistribution: '批发分销与配送路线',
    sectorFinance: '小额信贷与账款管理',
    sectorServices: '餐饮与综合服务',
    createTenantBtn: '+ 立即部署企业',
    branchesLabel: '分店数量',
    routesCountLabel: '活跃路线',
    registersCountLabel: 'POS 收银台',
    enterConsoleBtn: '打开控制台 →',
    daysOverdueLabel: '逾期天数',
    upToDate: '正常 (自动扣费)',
    gracePeriodBadge: '数据迁移期 (7天)',
    vaultBadge: '保险库封存 (已停用)',
    footerText: 'Veltrix System © 2026 — 具备实时汇率与税务同步的多租户 ERP 系统。',
  },
  ja: {
    heroSubtitle:
      '階層型マルチテナント設計：組織 → 企業 → 支店 → レジ・シフト および フィールド集金ルート。',
    activeModulesCount: '個の有効モジュール',
    includedInPlan: '契約プランに含まれています',
    clickToToggle: 'クリックして切り替え',
    routesTitle: 'フィールド集金ルート',
    routesDesc: 'エリア別巡回ルート、QR/現金回収、オフライン同期、日次精算。',
    auditTitle: '債権ポートフォリオ管理・監査',
    auditDesc: '支店別の延滞管理、集金担当者の精算確認、与信承認。',
    architectureTitle: '分離された企業階層構造（業務データを混在させない設計）',
    orgLevel: '1. 組織・法人企業',
    orgDesc: '独自の税務番号、税制、会計通貨、ライセンスを持つ法人単位。',
    compLevel: '2. 独立した支店・店舗',
    compDesc: '各拠点が独自のタイムゾーン、在庫、スタッフ、請求を管理。',
    branchLevel: '3. POSレジ・シフト管理',
    branchDesc: '担当者ごとに分離されたレジ開局、店頭決済、締め処理。',
    posRouteLevel: '4. 集金ルート・債権管理',
    posRouteDesc: '外回り集金、オフライン同期、スーパーバイザーによる照合。',
    iamTitle: '企業認証ゲートウェイ (IAM)',
    iamSubtitle: '企業や支店で割り当てられたロールに応じてワークステーションにログインします。',
    emailLabel: '社内メールアドレス',
    passLabel: 'セキュリティパスワード',
    loginBtn: '🔓 システムにログイン',
    validating: '認証中...',
    quickAccessTitle: '⚡ 階層ロール別クイックデモアクセス',
    quickAccessDesc: 'プロフィールをクリックすると認証情報が自動入力され、専用画面をテストできます：',
    roleSuperAdmin: '🛡️ スーパー管理者 (プラットフォーム全体管理)',
    roleOwner: '🏛️ オーナー / 代表取締役 (経営コンソール・支店管理)',
    roleCashier: '💳 POSキャッシャー (レジ端末・シフト管理)',
    roleVendor: '📈 CRM営業担当 (案件パイプライン・見積)',
    roleCollector: '🛵 ルート集金担当 (外回り集金・オフライン対応)',
    roleSupervisor: '📊 債権スーパーバイザー (ルート監査・延滞管理)',
    registerCompanyTitle: 'エコシステムへの新規企業登録',
    registerCompanyDesc: '上部で選択したモジュールで独立したテナント環境を構築します。',
    compNamePh: '法人名 / 会社名',
    taxIdPh: '法人番号 / 税務ID',
    ownerNamePh: '代表者氏名',
    ownerEmailPh: 'owner@company.jp',
    ownerPassPh: 'マスターパスワード',
    sectorRetail: '小売・ハードウェア店',
    sectorDistribution: '卸売流通・ルート配送',
    sectorFinance: 'マイクロファイナンス・与信管理',
    sectorServices: '飲食・サービス業',
    createTenantBtn: '+ 企業を今すぐ展開',
    branchesLabel: '支店数',
    routesCountLabel: '稼働ルート',
    registersCountLabel: 'POSレジ数',
    enterConsoleBtn: 'コンソールを開く →',
    daysOverdueLabel: '延滞日数',
    upToDate: '正常 (自動決済)',
    gracePeriodBadge: '移行期間 (7日)',
    vaultBadge: '保管庫 (一時停止)',
    footerText: 'Veltrix System © 2026 — 為替・税制自動同期対応マルチテナントERP。',
  },
  ru: {
    heroSubtitle:
      'Иерархическая мультиарендная архитектура: Организация → Компания → Филиал → Касса / Смена и Маршруты сбора.',
    activeModulesCount: 'активных модулей',
    includedInPlan: 'Активно в подписке',
    clickToToggle: 'Нажмите для вкл/выкл',
    routesTitle: 'Маршруты выездного сбора',
    routesDesc: 'Маршрутные листы по зонам, оплата QR/наличными, офлайн-режим и сдача выручки.',
    auditTitle: 'Контроль и аудит кредитного портфеля',
    auditDesc: 'Контроль просрочки по филиалам, сверка инкассаторов и одобрение лимитов.',
    architectureTitle: 'Разделенная корпоративная иерархия (Без смешивания операций)',
    orgLevel: '1. Организация и Юрлицо',
    orgDesc: 'Юридическое лицо со своим ИНН, налоговым режимом, валютой учета и лицензиями.',
    compLevel: '2. Независимые филиалы',
    compDesc: 'Каждая точка управляет своим часовым поясом, складом, персоналом и счетами.',
    branchLevel: '3. Кассы и смены POS',
    branchDesc: 'Открытие смены, оплата на кассе и сверка выручки отдельно по каждому кассиру.',
    posRouteLevel: '4. Маршруты и контроль портфеля',
    posRouteDesc: 'Выездной сбор, офлайн-синхронизация и сверка супервайзером.',
    iamTitle: 'Шлюз корпоративной аутентификации (IAM)',
    iamSubtitle: 'Войдите в рабочую станцию согласно вашей роли в компании или филиале.',
    emailLabel: 'Корпоративный Email',
    passLabel: 'Пароль безопасности',
    loginBtn: '🔓 Войти в систему',
    validating: 'Проверка...',
    quickAccessTitle: '⚡ Быстрый вход по иерархии ролей',
    quickAccessDesc: 'Нажмите на профиль для автозаполнения и входа в изолированный терминал:',
    roleSuperAdmin: '🛡️ Супер-Админ (Глобальное управление платформой)',
    roleOwner: '🏛️ Владелец / Директор (Исполнительная консоль и филиалы)',
    roleCashier: '💳 Кассир POS (Кассовый терминал и смена)',
    roleVendor: '📈 Менеджер CRM (Воронка продаж и КП)',
    roleCollector: '🛵 Выездной инкассатор (Маршрут сбора и офлайн)',
    roleSupervisor: '📊 Супервайзер портфеля (Аудит маршрутов и просрочки)',
    registerCompanyTitle: 'Регистрация новой компании в экосистеме',
    registerCompanyDesc: 'Разверните изолированный экземпляр с выбранными выше модулями.',
    compNamePh: 'Название компании / Юрлицо',
    taxIdPh: 'ИНН / Налоговый номер',
    ownerNamePh: 'ФИО директора / владельца',
    ownerEmailPh: 'owner@company.ru',
    ownerPassPh: 'Мастер-пароль',
    sectorRetail: 'Розничная торговля и стройматериалы',
    sectorDistribution: 'Оптовая дистрибуция и маршруты',
    sectorFinance: 'Микрофинансы и кредитный портфель',
    sectorServices: 'Общепит и сфера услуг',
    createTenantBtn: '+ Развернуть компанию',
    branchesLabel: 'Филиалы',
    routesCountLabel: 'Маршруты',
    registersCountLabel: 'Кассы POS',
    enterConsoleBtn: 'Открыть консоль →',
    daysOverdueLabel: 'Дней просрочки',
    upToDate: 'Активен (Автооплата)',
    gracePeriodBadge: 'Перенос (7 дн.)',
    vaultBadge: 'В хранилище (Стоп)',
    footerText: 'Veltrix System © 2026 — Мультиарендная ERP с синхронизацией валют и налогов.',
  },
  ar: {
    heroSubtitle:
      'بنية متعددة المستأجرين هرمية: المنظمة ← الشركة ← الفرع ← الصندوق / الوردية ومسارات التحصيل.',
    activeModulesCount: 'وحدات نشطة',
    includedInPlan: 'نشط في الاشتراك',
    clickToToggle: 'انقر للتفعيل أو الإيقاف',
    routesTitle: 'مسارات التحصيل الميداني',
    routesDesc: 'خطوط سير حسب المنطقة، تحصيل نقدي/QR، عمل بدون إنترنت وتسوية يومية.',
    auditTitle: 'الإشراف وتدقيق المحفظة الائتمانية',
    auditDesc: 'مراقبة المتأخرات لكل فرع، مطابقة المحصلين والموافقة على الائتمان.',
    architectureTitle: 'هيكل مؤسسي مفصل (فصل تام بين الفروع والمسارات)',
    orgLevel: '1. المنظمة والشركة القانونية',
    orgDesc: 'كيان قانوني برقم ضريبي مستقل ونظام ضريبي وعملة محاسبية وتراخيص.',
    compLevel: '2. فروع مستقلة',
    compDesc: 'يدير كل فرع منطقته الزمنية ومخزونه وموظفيه وفواتيره بشكل منفصل.',
    branchLevel: '3. صناديق الدفع والورديات (POS)',
    branchDesc: 'فتح الوردية والبيع المباشر والجرد منفصل لكل أمين صندوق.',
    posRouteLevel: '4. المسارات والإشراف على المحفظة',
    posRouteDesc: 'تحصيل ميداني ومزامنة غير متصلة ومطابقة من قبل المشرف.',
    iamTitle: 'بوابة المصادقة المؤسسية (IAM)',
    iamSubtitle: 'سجل الدخول إلى محطة العمل الخاصة بك حسب الدور المخصص لك في الفرع.',
    emailLabel: 'البريد الإلكتروني المؤسسي',
    passLabel: 'كلمة المرور الآمنة',
    loginBtn: '🔓 تسجيل الدخول للنظام',
    validating: 'جاري التحقق...',
    quickAccessTitle: '⚡ وصول سريع حسب التسلسل الهرمي للأدوار',
    quickAccessDesc: 'انقر على أي ملف لتعبئة البيانات وتجربة الوحدة المعزولة فوراً:',
    roleSuperAdmin: '🛡️ المشرف العام (التحكم الشامل بالمنصة)',
    roleOwner: '🏛️ المالك / المدير التنفيذي (لوحة الإدارة والفروع)',
    roleCashier: '💳 أمين صندوق POS (محطة البيع والوردية)',
    roleVendor: '📈 مسؤول مبيعات CRM (العملاء المحتملون والعروض)',
    roleCollector: '🛵 محصل ميداني (مسار التحصيل والعمل دون اتصال)',
    roleSupervisor: '📊 مشرف المحفظة (تدقيق المسارات والمتأخرات)',
    registerCompanyTitle: 'إضافة شركة جديدة في النظام',
    registerCompanyDesc: 'إنشاء بيئة مستقلة للشركة مع الوحدات المحددة أعلاه.',
    compNamePh: 'الاسم القانوني للشركة',
    taxIdPh: 'الرقم الضريبي',
    ownerNamePh: 'اسم المدير / المالك',
    ownerEmailPh: 'owner@company.ae',
    ownerPassPh: 'كلمة المرور الرئيسية',
    sectorRetail: 'التجزئة ومواد البناء',
    sectorDistribution: 'التوزيع بالجملة والمسارات',
    sectorFinance: 'التمويل الأصغر ومحفظة الائتمان',
    sectorServices: 'المطاعم والخدمات',
    createTenantBtn: '+ إطلاق الشركة الآن',
    branchesLabel: 'الفروع',
    routesCountLabel: 'المسارات النشطة',
    registersCountLabel: 'صناديق POS',
    enterConsoleBtn: 'فتح اللوحة ←',
    daysOverdueLabel: 'أيام التأخير',
    upToDate: 'منتظم (دفع تلقائي)',
    gracePeriodBadge: 'فترة النقل (7 أيام)',
    vaultBadge: 'في الخزنة (معلق)',
    footerText: 'Veltrix System © 2026 — نظام ERP متعدد المستأجرين مع مزامنة العملات والضرائب.',
  },
  ko: {
    heroSubtitle:
      '계층형 멀티테넌트 아키텍처: 조직 → 기업 → 지점 → 계산대/교대근무 및 현장 수금 루트.',
    activeModulesCount: '개 활성 모듈',
    includedInPlan: '구독 포함됨',
    clickToToggle: '클릭하여 활성화/비활성화',
    routesTitle: '현장 수금 루트',
    routesDesc: '구역별 일정, QR/현금 수금, 오프라인 작업 및 일일 정산.',
    auditTitle: '채권 포트폴리오 감독 및 감사',
    auditDesc: '지점별 연체 관리, 수금원 정산 확인 및 신용 한도 승인.',
    architectureTitle: '분리된 기업 계층 구조 (업무 혼선 제로)',
    orgLevel: '1. 조직 및 법인 기업',
    orgDesc: '고유 사업자번호, 과세 유형, 회계 통화 및 라이선스를 가진 법인.',
    compLevel: '2. 독립 지점 운영',
    compDesc: '각 지점이 시간대, 로컬 재고, 직원 및 청구를 개별 관리.',
    branchLevel: '3. POS 계산대 및 교대근무',
    branchDesc: '담당자별로 분리된 시재 개시, 매장 결제 및 마감 정산.',
    posRouteLevel: '4. 수금 루트 및 채권 감독',
    posRouteDesc: '현장 방문 수금, 오프라인 동기화 및 슈퍼바이저 대조.',
    iamTitle: '기업 인증 게이트웨이 (IAM)',
    iamSubtitle: '기업 및 지점에서 부여된 역할에 따라 전용 워크스테이션에 로그인하세요.',
    emailLabel: '사내 이메일',
    passLabel: '보안 비밀번호',
    loginBtn: '🔓 시스템 로그인',
    validating: '확인 중...',
    quickAccessTitle: '⚡ 계층 역할별 빠른 데모 접속',
    quickAccessDesc: '프로필을 클릭하면 자격 증명이 자동 입력되어 분리된 모듈을 테스트할 수 있습니다:',
    roleSuperAdmin: '🛡️ 슈퍼 관리자 (플랫폼 글로벌 제어)',
    roleOwner: '🏛️ 대표 / 오너 (경영진 콘솔 및 지점별 상세)',
    roleCashier: '💳 POS 캐셔 (계산대 단말기 및 교대근무)',
    roleVendor: '📈 CRM 영업 담당 (파이프라인 및 견적)',
    roleCollector: '🛵 현장 수금원 (외근 수금 루트 및 오프라인)',
    roleSupervisor: '📊 채권 슈퍼바이저 (루트 감사 및 연체 관리)',
    registerCompanyTitle: '에코시스템 내 신규 기업 등록',
    registerCompanyDesc: '위에서 선택한 모듈로 독립된 기업 인스턴스를 배포합니다.',
    compNamePh: '법인명 / 기업 이름',
    taxIdPh: '사업자등록번호',
    ownerNamePh: '대표자 성명',
    ownerEmailPh: 'owner@company.kr',
    ownerPassPh: '마스터 비밀번호',
    sectorRetail: '소매 및 철물/건자재',
    sectorDistribution: '도매 유통 및 배송 루트',
    sectorFinance: '소액 금융 및 채권 관리',
    sectorServices: '외식 및 서비스업',
    createTenantBtn: '+ 지금 기업 배포하기',
    branchesLabel: '지점 수',
    routesCountLabel: '활성 루트',
    registersCountLabel: 'POS 대수',
    enterConsoleBtn: '콘솔 열기 →',
    daysOverdueLabel: '연체 일수',
    upToDate: '정상 (자동 결제)',
    gracePeriodBadge: '데이터 이전 (7일)',
    vaultBadge: '보관소 격리 (정지)',
    footerText: 'Veltrix System © 2026 — 실시간 환율 및 세금 동기화 멀티테넌트 ERP.',
  },
  hi: {
    heroSubtitle:
      'पदानुक्रमित मल्टी-टेनेंट आर्किटेक्चर: संगठन → कंपनी → शाखा → कैश रजिस्टर/शिफ्ट और फील्ड कलेक्शन रूट।',
    activeModulesCount: 'सक्रिय मॉड्यूल',
    includedInPlan: 'सदस्यता में सक्रिय',
    clickToToggle: 'सक्रिय/निष्क्रिय करने के लिए क्लिक करें',
    routesTitle: 'फील्ड कलेक्शन रूट',
    routesDesc: 'ज़ोन के अनुसार यात्रा कार्यक्रम, QR/नकद वसूली, ऑफ़लाइन सिंक और दैनिक निपटान।',
    auditTitle: 'पोर्टफोलियो पर्यवेक्षण और ऑडिट',
    auditDesc: 'शाखा के अनुसार बकाया नियंत्रण, कलेक्टर मिलान और क्रेडिट स्वीकृति।',
    architectureTitle: 'अलग-अलग कॉर्पोरेट संरचना (कोई मिश्रित संचालन नहीं)',
    orgLevel: '1. संगठन और कानूनी कंपनी',
    orgDesc: 'अपने स्वयं के टैक्स आईडी, कर प्रणाली, मुद्रा और लाइसेंस वाली कानूनी इकाई।',
    compLevel: '2. स्वतंत्र शाखाएं',
    compDesc: 'प्रत्येक शाखा अपना समय क्षेत्र, स्थानीय इन्वेंट्री, स्टाफ और बिलिंग प्रबंधित करती है।',
    branchLevel: '3. POS रजिस्टर और शिफ्ट',
    branchDesc: 'प्रत्येक कैशियर के लिए अलग शिफ्ट ओपनिंग, काउंटर बिलिंग और कैश मिलान।',
    posRouteLevel: '4. रूट और पोर्टफोलियो पर्यवेक्षण',
    posRouteDesc: 'फील्ड वसूली, ऑफ़लाइन सिंक और सुपरवाइजर द्वारा मिलान।',
    iamTitle: 'कॉर्पोरेट प्रमाणीकरण गेटवे (IAM)',
    iamSubtitle: 'अपनी कंपनी या शाखा में सौंपी गई भूमिका के अनुसार अपने वर्कस्टेशन में लॉग इन करें।',
    emailLabel: 'कॉर्पोरेट ईमेल',
    passLabel: 'सुरक्षा पासवर्ड',
    loginBtn: '🔓 सिस्टम में लॉग इन करें',
    validating: 'सत्यापित हो रहा है...',
    quickAccessTitle: '⚡ पदानुक्रम भूमिका द्वारा त्वरित डेमो एक्सेस',
    quickAccessDesc: 'क्रेडेंशियल स्वतः भरने और अलग वर्कस्टेशन का परीक्षण करने के लिए किसी भी प्रोफ़ाइल पर क्लिक करें:',
    roleSuperAdmin: '🛡️ सुपर एडमिन (ग्लोबल प्लेटफॉर्म कंट्रोल)',
    roleOwner: '🏛️ मालिक / निदेशक (एग्जीक्यूटिव कंसोल और शाखाएं)',
    roleCashier: '💳 POS कैशियर (कैश टर्मिनल और शिफ्ट)',
    roleVendor: '📈 CRM एग्जीक्यूटिव (पाइपलाइन और कोटेशन)',
    roleCollector: '🛵 फील्ड कलेक्टर (स्ट्रीट रूट और ऑफ़लाइन)',
    roleSupervisor: '📊 पोर्टफोलियो सुपरवाइजर (रूट ऑडिट और बकाया)',
    registerCompanyTitle: 'इकोसिस्टम में नई कंपनी पंजीकृत करें',
    registerCompanyDesc: 'ऊपर चुने गए मॉड्यूल के साथ एक अलग कंपनी इंस्टेंस तैनात करें।',
    compNamePh: 'कंपनी का कानूनी नाम',
    taxIdPh: 'टैक्स आईडी नंबर',
    ownerNamePh: 'निदेशक / मालिक का नाम',
    ownerEmailPh: 'owner@company.in',
    ownerPassPh: 'मास्टर पासवर्ड',
    sectorRetail: 'खुदरा और हार्डवेयर स्टोर',
    sectorDistribution: 'थोक वितरण और रूट',
    sectorFinance: 'माइक्रोफाइनेंस और क्रेडिट पोर्टफोलियो',
    sectorServices: 'रेस्तरां और सेवाएं',
    createTenantBtn: '+ अभी कंपनी तैनात करें',
    branchesLabel: 'शाखाएं',
    routesCountLabel: 'सक्रिय रूट',
    registersCountLabel: 'POS रजिस्टर',
    enterConsoleBtn: 'कंसोल खोलें →',
    daysOverdueLabel: 'बकाया दिन',
    upToDate: 'नियमित (ऑटो-बिलिंग)',
    gracePeriodBadge: 'पोर्टेबिलिटी (7 दिन)',
    vaultBadge: 'वॉल्ट में (निलंबित)',
    footerText: 'Veltrix System © 2026 — लाइव मुद्रा और कर सिंक्रनाइज़ेशन के साथ मल्टी-टेनेंट ERP।',
  },
};

export default function VeltrixSaaSControlPanel() {
  const router = useRouter();
  const { lang, t, country, formatMoney } = useLanguage();
  const ui = PAGE_I18N[lang] || PAGE_I18N.es;

  const auth = useVeltrixAuth();
  const {
    companies,
    login,
    updateCompanyOverdue,
  } = auth;

  // Estado de módulos seleccionados en el configurador SaaS
  const [selectedModules, setSelectedModules] = useState<string[]>([
    'crm',
    'pos',
    'credit',
    'routes',
    'audit',
  ]);

  // Estado de Login IAM
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Estado para Alta de Nueva Empresa en el Ecosistema
  const [showNewCompForm, setShowNewCompForm] = useState(false);
  const [compName, setCompName] = useState('');
  const [compTaxId, setCompTaxId] = useState('');
  const [compSector, setCompSector] = useState('Distribución Mayorista & Rutas');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPass, setOwnerPass] = useState('');

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((item) => item !== id)
          : prev
        : [...prev, id]
    );
  };

  const totalMonthlyUsd = CORE_MODULES.filter((m) =>
    selectedModules.includes(m.id)
  ).reduce((acc, m) => acc + m.priceUsd, 0);

  const getModuleText = (id: ModuleItem['id']) => {
    if (id === 'crm') return { title: t.crmTitle, desc: t.crmDesc };
    if (id === 'pos') return { title: t.posTitle, desc: t.posDesc };
    if (id === 'credit') return { title: t.creditTitle, desc: t.creditDesc };
    if (id === 'hr') return { title: t.hrTitle, desc: t.hrDesc };
    if (id === 'routes') return { title: ui.routesTitle, desc: ui.routesDesc };
    return { title: ui.auditTitle, desc: ui.auditDesc };
  };

  const routeByRole = (role: UserRole) => {
    if (role === 'superadmin') router.push('/dashboard/admin');
    else if (role === 'owner') router.push('/dashboard/owner');
    else if (role === 'cashier') router.push('/dashboard/cashier');
    else if (role === 'vendor') router.push('/dashboard/vendor');
    else if (role === 'collector') router.push('/dashboard/collector');
    else if (role === 'supervisor') router.push('/dashboard/owner');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await login(email, password);
    setLoading(false);

    if (res.ok && res.session) {
      routeByRole(res.session.role);
    } else {
      setErrorMsg(res.error || 'Credenciales no válidas.');
    }
  };

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim() || !compTaxId.trim() || !ownerEmail.trim()) return;

    const moduleTitles = CORE_MODULES.filter((m) =>
      selectedModules.includes(m.id)
    ).map((m) => getModuleText(m.id).title);

    const companyDetails = {
      name: compName.trim(),
      taxId: compTaxId.trim(),
      type: compSector,
      plan: totalMonthlyUsd,
      modules: moduleTitles,
      ownerName: ownerName.trim() || 'Director General',
      ownerEmail: ownerEmail.trim(),
      ownerPassword: ownerPass.trim() || '123',
    };
    const authActions = auth as unknown as Record<string, unknown>;
    const registerCompany =
      authActions.registerCompany ??
      authActions.createCompany ??
      authActions.addCompany ??
      authActions.registerNewCompany;

    if (typeof registerCompany !== 'function') {
      setErrorMsg('No está disponible el registro de empresas.');
      return;
    }

    registerCompany(companyDetails);

    setCompName('');
    setCompTaxId('');
    setOwnerName('');
    setOwnerEmail('');
    setOwnerPass('');
    setShowNewCompForm(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* CABECERA PRINCIPAL CON CONMUTADOR DE 12 IDIOMAS Y PAÍSES */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
                🌐 {t.saasPanel}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {country.flag} {country.name} · {country.taxIdName}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
              Veltrix <span className="text-blue-500">System</span>
            </h1>
            <p className="text-slate-400 text-xs md:text-sm mt-1 max-w-2xl">
              {ui.heroSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageDropdown />
            <button
              onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-slate-900 hover:bg-slate-800 text-blue-400 border border-blue-500/30 text-xs font-bold px-4 py-2.5 rounded-lg transition cursor-pointer"
            >
              {t.goToAdmin}
            </button>
          </div>
        </header>

        {/* BARRA DE ESTADO REGIONAL (RELOJ EN VIVO, MONEDA 24H, RÉGIMEN FISCAL) */}
        <RegionalStatusBar />

        {/* SECCIÓN 1: ARQUITECTURA JERÁRQUICA DESGLOSADA */}
        <section className="bg-slate-900/50 border border-slate-800/90 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3">
            🏛️ {ui.architectureTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-xl">
              <p className="font-bold text-white">{ui.orgLevel}</p>
              <p className="text-slate-400 mt-1 leading-relaxed">{ui.orgDesc}</p>
            </div>
            <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-xl">
              <p className="font-bold text-emerald-400">{ui.compLevel}</p>
              <p className="text-slate-400 mt-1 leading-relaxed">{ui.compDesc}</p>
            </div>
            <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-xl">
              <p className="font-bold text-cyan-400">{ui.branchLevel}</p>
              <p className="text-slate-400 mt-1 leading-relaxed">{ui.branchDesc}</p>
            </div>
            <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-xl">
              <p className="font-bold text-amber-400">{ui.posRouteLevel}</p>
              <p className="text-slate-400 mt-1 leading-relaxed">{ui.posRouteDesc}</p>
            </div>
          </div>
        </section>

        {/* SECCIÓN 2: CONFIGURADOR DE MÓDULOS Y CALCULADORA DE SUSCRIPCIÓN */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-xl font-bold">{t.moduleConfig}</h2>
              <p className="text-xs text-slate-400">
                {selectedModules.length} {ui.activeModulesCount} · {ui.clickToToggle}
              </p>
            </div>
            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <span className="text-xs text-slate-400">{t.monthlySub}:</span>
              <span className="text-lg font-extrabold text-emerald-400">
                {formatMoney(totalMonthlyUsd, true)} / {t.perMonth}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CORE_MODULES.map((mod) => {
              const active = selectedModules.includes(mod.id);
              const info = getModuleText(mod.id);
              return (
                <div
                  key={mod.id}
                  onClick={() => toggleModule(mod.id)}
                  className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'bg-slate-900 border-blue-500/60 shadow-lg shadow-blue-950/30'
                      : 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-90'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-2xl">{mod.icon}</span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {formatMoney(mod.priceUsd)}/{t.perMonth}
                      </span>
                    </div>
                    <h3 className="font-bold text-base mt-3 text-white">
                      {info.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {info.desc}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-between items-center text-[11px]">
                    <span className={active ? 'text-blue-400 font-semibold' : 'text-slate-500'}>
                      {active ? `✓ ${ui.includedInPlan}` : ui.clickToToggle}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECCIÓN 3: AUTENTICACIÓN IAM Y ACCESOS DIRECTOS POR ROL */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Pasarela IAM */}
          <div id="login" className="lg:col-span-5 scroll-mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold">🔐 {ui.iamTitle}</h2>
              <p className="text-xs text-slate-400 mt-1">{ui.iamSubtitle}</p>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-semibold">
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  {ui.emailLabel}
                </label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  {ui.passLabel}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
              >
                {loading ? ui.validating : ui.loginBtn}
              </button>
            </form>
          </div>

          {/* Roles jerárquicos: solo informativo, sin cuentas de demo */}
          <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">🧭 Roles jerárquicos</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cada persona entra con su propio correo y contraseña. El sistema detecta su rol y la lleva a su panel.
                Los trabajadores los crea el dueño de la empresa desde su panel.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {[
                { label: ui.roleSuperAdmin, cls: 'bg-purple-950/30 border-purple-500/30 text-purple-300' },
                { label: ui.roleOwner, cls: 'bg-blue-950/30 border-blue-500/30 text-blue-300' },
                { label: ui.roleSupervisor, cls: 'bg-rose-950/30 border-rose-500/30 text-rose-300' },
                { label: ui.roleCashier, cls: 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' },
                { label: ui.roleVendor, cls: 'bg-cyan-950/30 border-cyan-500/30 text-cyan-300' },
                { label: ui.roleCollector, cls: 'bg-amber-950/30 border-amber-500/30 text-amber-300' },
              ].map((r) => (
                <div key={r.label} className={`p-3 rounded-xl border ${r.cls}`}>
                  <p className="font-bold">{r.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECCIÓN 4: EMPRESAS EN EL ECOSISTEMA Y DESGLOSE OPERATIVO */}
        <section className="space-y-4 pt-2">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xl font-bold">{t.companiesTitle}</h2>
              <p className="text-xs text-slate-400">{t.adminSubtitle}</p>
            </div>
            <button
              onClick={() => setShowNewCompForm(!showNewCompForm)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              {t.newCompany}
            </button>
          </div>

          {showNewCompForm && (
            <form
              onSubmit={handleCreateCompany}
              className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 space-y-4 text-xs"
            >
              <div>
                <h3 className="font-bold text-sm text-emerald-400">
                  {ui.registerCompanyTitle}
                </h3>
                <p className="text-slate-400">{ui.registerCompanyDesc}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder={ui.compNamePh}
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <input
                  type="text"
                  required
                  placeholder={`${ui.taxIdPh} (${country.taxIdName})`}
                  value={compTaxId}
                  onChange={(e) => setCompTaxId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <select
                  value={compSector}
                  onChange={(e) => setCompSector(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value={ui.sectorDistribution}>{ui.sectorDistribution}</option>
                  <option value={ui.sectorRetail}>{ui.sectorRetail}</option>
                  <option value={ui.sectorFinance}>{ui.sectorFinance}</option>
                  <option value={ui.sectorServices}>{ui.sectorServices}</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder={ui.ownerNamePh}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <input
                  type="email"
                  required
                  placeholder={ui.ownerEmailPh}
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder={ui.ownerPassPh}
                    value={ownerPass}
                    onChange={(e) => setOwnerPass(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white flex-1"
                  />
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg cursor-pointer shrink-0"
                  >
                    {ui.createTenantBtn}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => {
              const isActive = c.daysOverdue === 0;
              const isGrace = c.daysOverdue >= 1 && c.daysOverdue <= 7;
              return (
                <div
                  key={c.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-base text-white">{c.name}</h3>
                        <p className="text-[11px] text-slate-400">
                          {country.taxIdName}: <strong className="text-slate-200">{c.taxId}</strong> · {t.businessType} {c.type}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isGrace
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {isActive
                          ? t.activeService
                          : isGrace
                          ? ui.gracePeriodBadge
                          : t.suspendedService}
                      </span>
                    </div>

                    {/* Resumen Jerárquico por Empresa */}
                    <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[11px]">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <p className="text-slate-400">{ui.branchesLabel}</p>
                        <p className="font-bold text-white text-sm mt-0.5">2</p>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <p className="text-slate-400">{ui.registersCountLabel}</p>
                        <p className="font-bold text-emerald-400 text-sm mt-0.5">4</p>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <p className="text-slate-400">{ui.routesCountLabel}</p>
                        <p className="font-bold text-amber-400 text-sm mt-0.5">3</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t.monthlyFee}:</span>
                      <span className="font-bold text-emerald-400">
                        {formatMoney(c.plan)} / {t.perMonth}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() =>
                          updateCompanyOverdue(c.id, isActive ? 10 : 0)
                        }
                        className={`px-3 py-1.5 rounded-lg font-semibold text-[11px] cursor-pointer transition ${
                          isActive
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {isActive ? t.suspendBtn : t.reactivateBtn}
                      </button>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-slate-800 pt-6 mt-8 text-center text-xs text-slate-500">
          {ui.footerText}
        </footer>
      </div>
    </main>
  );
}

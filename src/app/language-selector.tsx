'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type LangCode = 'es' | 'en' | 'it' | 'pt' | 'fr' | 'de' | 'zh' | 'ja' | 'ru' | 'ar' | 'ko' | 'hi';
export type CountryCode =
  | 'BO' | 'US' | 'MX' | 'CO' | 'AR' | 'CL' | 'PE' | 'BR' | 'ES' | 'IT' | 'FR' | 'DE' | 'RU' | 'CN' | 'JP' | 'AE'
  | 'EC' | 'PY' | 'UY' | 'VE' | 'GT' | 'HN' | 'SV' | 'NI' | 'CR' | 'PA' | 'DO' | 'PR' | 'CU'
  | 'CA' | 'GB' | 'PT' | 'IN' | 'KR' | 'SA';
export type CurrencyMode = 'local' | 'dual' | 'anchor';
export type TaxRegimeId = 'general' | 'simplified' | 'exempt';
export type BusinessSectorId = 'standard' | 'essential' | 'special';

export interface TimezoneOption {
  tz: string;
  label: string;
  utcOffset: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  flag: string;
  currency: string;
  symbol: string;
  rate: number; // Tasa base de respaldo respecto a 1 USD
  timezones: TimezoneOption[];
  taxName: string;
  taxRate: number; // Tasa estándar
  reducedTaxRate: number; // Tasa reducida (alimentos básicos, salud, libros, etc.)
  specialTaxRate: number; // Tasa especial / lujo / impuestos adicionales
  simplifiedRegimeName: string; // Nombre local para pequeños negocios sin IVA
  taxIdName: string;
  phonePrefix: string;
  locale: string;
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: 'BO',
    name: 'Bolivia',
    flag: '🇧🇴',
    currency: 'BOB',
    symbol: 'Bs',
    rate: 12.06, // TCO del BCB (4-nov-2026). Desde el 29-jun-2026 el tipo de cambio es flexible: se actualiza a diario
    timezones: [{ tz: 'America/La_Paz', label: 'Santa Cruz / La Paz / Cochabamba', utcOffset: 'UTC-4' }],
    taxName: 'IVA',
    taxRate: 13,
    reducedTaxRate: 0, // Libros / transporte internacional / exenciones de ley
    specialTaxRate: 16, // IVA 13% + IT 3% integrado referencial
    simplifiedRegimeName: 'RTS (Régimen Simplificado - 0% IVA)',
    taxIdName: 'NIT',
    phonePrefix: '+591',
    locale: 'es-BO',
  },
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: '$',
    rate: 1,
    timezones: [
      { tz: 'America/New_York', label: 'Eastern (New York / Miami)', utcOffset: 'UTC-5' },
      { tz: 'America/Chicago', label: 'Central (Texas / Chicago)', utcOffset: 'UTC-6' },
      { tz: 'America/Denver', label: 'Mountain (Denver / Phoenix)', utcOffset: 'UTC-7' },
      { tz: 'America/Los_Angeles', label: 'Pacific (Los Angeles / Seattle)', utcOffset: 'UTC-8' },
      { tz: 'America/Anchorage', label: 'Alaska (Anchorage)', utcOffset: 'UTC-9' },
      { tz: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)', utcOffset: 'UTC-10' },
    ],
    taxName: 'Sales Tax',
    taxRate: 8,
    reducedTaxRate: 0,
    specialTaxRate: 10.5,
    simplifiedRegimeName: 'Small Seller / Nexus Exempt (0%)',
    taxIdName: 'EIN',
    phonePrefix: '+1',
    locale: 'en-US',
  },
  {
    code: 'MX',
    name: 'México',
    flag: '🇲🇽',
    currency: 'MXN',
    symbol: '$',
    rate: 18.5,
    timezones: [
      { tz: 'America/Mexico_City', label: 'Centro (CDMX / Monterrey / GDL)', utcOffset: 'UTC-6' },
      { tz: 'America/Cancun', label: 'Sureste (Cancún / Quintana Roo)', utcOffset: 'UTC-5' },
      { tz: 'America/Chihuahua', label: 'Pacífico (Chihuahua / Sinaloa)', utcOffset: 'UTC-7' },
      { tz: 'America/Tijuana', label: 'Noroeste (Tijuana / Mexicali)', utcOffset: 'UTC-8' },
    ],
    taxName: 'IVA',
    taxRate: 16,
    reducedTaxRate: 8, // Estímulo Frontera Norte / Medicinas 0%
    specialTaxRate: 24, // IVA + IEPS
    simplifiedRegimeName: 'RESICO / Pequeño Contribuyente (0%)',
    taxIdName: 'RFC',
    phonePrefix: '+52',
    locale: 'es-MX',
  },
  {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    currency: 'BRL',
    symbol: 'R$',
    rate: 5.5,
    timezones: [
      { tz: 'America/Sao_Paulo', label: 'Brasília / São Paulo / Rio', utcOffset: 'UTC-3' },
      { tz: 'America/Cuiaba', label: 'Amazonas / Mato Grosso (Manaus)', utcOffset: 'UTC-4' },
      { tz: 'America/Rio_Branco', label: 'Acre (Rio Branco)', utcOffset: 'UTC-5' },
      { tz: 'America/Noronha', label: 'Fernando de Noronha', utcOffset: 'UTC-2' },
    ],
    taxName: 'ICMS/ISS',
    taxRate: 17,
    reducedTaxRate: 7,
    specialTaxRate: 25,
    simplifiedRegimeName: 'MEI / Simples Nacional (0% IVA)',
    taxIdName: 'CNPJ',
    phonePrefix: '+55',
    locale: 'pt-BR',
  },
  {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    currency: 'CLP',
    symbol: '$',
    rate: 950,
    timezones: [
      { tz: 'America/Santiago', label: 'Continental (Santiago / Valparaíso)', utcOffset: 'UTC-3' },
      { tz: 'America/Punta_Arenas', label: 'Magallanes (Punta Arenas)', utcOffset: 'UTC-3' },
      { tz: 'Pacific/Easter', label: 'Isla de Pascua (Rapa Nui)', utcOffset: 'UTC-5' },
    ],
    taxName: 'IVA',
    taxRate: 19,
    reducedTaxRate: 0,
    specialTaxRate: 27,
    simplifiedRegimeName: 'Pro Pyme / Microempresa (0% Exento)',
    taxIdName: 'RUT',
    phonePrefix: '+56',
    locale: 'es-CL',
  },
  {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    currency: 'ARS',
    symbol: '$',
    rate: 1050,
    timezones: [
      { tz: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires / CABA', utcOffset: 'UTC-3' },
      { tz: 'America/Argentina/Cordoba', label: 'Centro (Córdoba / Rosario)', utcOffset: 'UTC-3' },
      { tz: 'America/Argentina/Mendoza', label: 'Cuyo (Mendoza / San Juan)', utcOffset: 'UTC-3' },
    ],
    taxName: 'IVA',
    taxRate: 21,
    reducedTaxRate: 10.5, // Alimentos básicos / tecnología / salud
    specialTaxRate: 27, // Telecomunicaciones / energía comercial
    simplifiedRegimeName: 'Monotributo (Sin IVA discriminado - 0%)',
    taxIdName: 'CUIT',
    phonePrefix: '+54',
    locale: 'es-AR',
  },
  {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    symbol: '$',
    rate: 4100,
    timezones: [{ tz: 'America/Bogota', label: 'Bogotá / Medellín / Cali', utcOffset: 'UTC-5' }],
    taxName: 'IVA',
    taxRate: 19,
    reducedTaxRate: 5, // Canasta familiar / salud
    specialTaxRate: 27, // IVA + Impoconsumo
    simplifiedRegimeName: 'No Responsable de IVA / RST (0%)',
    taxIdName: 'NIT',
    phonePrefix: '+57',
    locale: 'es-CO',
  },
  {
    code: 'PE',
    name: 'Perú',
    flag: '🇵🇪',
    currency: 'PEN',
    symbol: 'S/',
    rate: 3.75,
    timezones: [{ tz: 'America/Lima', label: 'Lima / Arequipa / Cusco', utcOffset: 'UTC-5' }],
    taxName: 'IGV',
    taxRate: 18,
    reducedTaxRate: 8, // Ley MYPE Restaurantes / Hoteles (8%)
    specialTaxRate: 25,
    simplifiedRegimeName: 'Nuevo RUS (Boleta sin IGV - 0%)',
    taxIdName: 'RUC',
    phonePrefix: '+51',
    locale: 'es-PE',
  },
  {
    code: 'ES',
    name: 'España',
    flag: '🇪🇸',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    timezones: [
      { tz: 'Europe/Madrid', label: 'Península y Baleares (Madrid / BCN)', utcOffset: 'UTC+1' },
      { tz: 'Atlantic/Canary', label: 'Islas Canarias (IGIC)', utcOffset: 'UTC+0' },
    ],
    taxName: 'IVA',
    taxRate: 21,
    reducedTaxRate: 10, // Hostelería / alimentos (10% / 4% superreducido)
    specialTaxRate: 26.2, // Con Recargo de Equivalencia
    simplifiedRegimeName: 'Franquicia / Autónomo Exento (0%)',
    taxIdName: 'NIF/CIF',
    phonePrefix: '+34',
    locale: 'es-ES',
  },
  {
    code: 'IT',
    name: 'Italia',
    flag: '🇮🇹',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    timezones: [{ tz: 'Europe/Rome', label: 'Roma / Milano / Napoli / Torino', utcOffset: 'UTC+1' }],
    taxName: 'IVA',
    taxRate: 22,
    reducedTaxRate: 10, // Ristorazione / Alimentari (10% / 4%)
    specialTaxRate: 25,
    simplifiedRegimeName: 'Regime Forfettario (Esente IVA - 0%)',
    taxIdName: 'Partita IVA',
    phonePrefix: '+39',
    locale: 'it-IT',
  },
  {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    timezones: [
      { tz: 'Europe/Paris', label: 'Métropole (Paris / Lyon / Marseille)', utcOffset: 'UTC+1' },
      { tz: 'America/Guadeloupe', label: 'Antilles (Guadeloupe / Martinique)', utcOffset: 'UTC-4' },
      { tz: 'Indian/Reunion', label: 'La Réunion (Saint-Denis)', utcOffset: 'UTC+4' },
    ],
    taxName: 'TVA',
    taxRate: 20,
    reducedTaxRate: 5.5,
    specialTaxRate: 22,
    simplifiedRegimeName: 'Micro-entrepreneur (Franchise TVA 0%)',
    taxIdName: 'SIRET',
    phonePrefix: '+33',
    locale: 'fr-FR',
  },
  {
    code: 'DE',
    name: 'Deutschland',
    flag: '🇩🇪',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    timezones: [{ tz: 'Europe/Berlin', label: 'Berlin / München / Frankfurt', utcOffset: 'UTC+1' }],
    taxName: 'MwSt',
    taxRate: 19,
    reducedTaxRate: 7,
    specialTaxRate: 21,
    simplifiedRegimeName: 'Kleinunternehmer (§19 UStG - 0%)',
    taxIdName: 'USt-IdNr',
    phonePrefix: '+49',
    locale: 'de-DE',
  },
  {
    code: 'RU',
    name: 'Россия (Rusia)',
    flag: '🇷🇺',
    currency: 'RUB',
    symbol: '₽',
    rate: 96,
    timezones: [
      { tz: 'Europe/Moscow', label: 'Moscú / San Petersburgo (MSK)', utcOffset: 'UTC+3' },
      { tz: 'Asia/Yekaterinburg', label: 'Ekaterimburgo (YEKT)', utcOffset: 'UTC+5' },
      { tz: 'Asia/Novosibirsk', label: 'Novosibirsk (NOVT)', utcOffset: 'UTC+7' },
      { tz: 'Asia/Vladivostok', label: 'Vladivostok (VLAT)', utcOffset: 'UTC+10' },
    ],
    taxName: 'НДС (VAT)',
    taxRate: 20,
    reducedTaxRate: 10,
    specialTaxRate: 22,
    simplifiedRegimeName: 'УСН / Самозанятый (Sin НДС - 0%)',
    taxIdName: 'ИНН (INN)',
    phonePrefix: '+7',
    locale: 'ru-RU',
  },
  {
    code: 'CN',
    name: 'China',
    flag: '🇨🇳',
    currency: 'CNY',
    symbol: '¥',
    rate: 7.2,
    timezones: [
      { tz: 'Asia/Shanghai', label: 'Beijing / Shanghai / Shenzhen', utcOffset: 'UTC+8' },
      { tz: 'Asia/Urumqi', label: 'Xinjiang (Ürümqi)', utcOffset: 'UTC+6' },
    ],
    taxName: 'VAT',
    taxRate: 13,
    reducedTaxRate: 6, // Servicios modernos / restauración
    specialTaxRate: 17,
    simplifiedRegimeName: 'Small-scale Taxpayer (小规模 - 0%/1%)',
    taxIdName: 'USCC',
    phonePrefix: '+86',
    locale: 'zh-CN',
  },
  {
    code: 'JP',
    name: 'Japan',
    flag: '🇯🇵',
    currency: 'JPY',
    symbol: '¥',
    rate: 155,
    timezones: [{ tz: 'Asia/Tokyo', label: 'Tokyo / Osaka / Nagoya (JST)', utcOffset: 'UTC+9' }],
    taxName: 'JCT',
    taxRate: 10,
    reducedTaxRate: 8, // Alimentos y bebidas para llevar
    specialTaxRate: 12,
    simplifiedRegimeName: 'Tax-Exempt Enterprise (<10M¥ - 0%)',
    taxIdName: 'T-Number',
    phonePrefix: '+81',
    locale: 'ja-JP',
  },
  {
    code: 'AE',
    name: 'UAE (Emiratos)',
    flag: '🇦🇪',
    currency: 'AED',
    symbol: 'د.إ',
    rate: 3.67,
    timezones: [{ tz: 'Asia/Dubai', label: 'Dubai / Abu Dhabi (GST)', utcOffset: 'UTC+4' }],
    taxName: 'VAT',
    taxRate: 5,
    reducedTaxRate: 0,
    specialTaxRate: 9,
    simplifiedRegimeName: 'Free Zone / Small Business Relief (0%)',
    taxIdName: 'TRN',
    phonePrefix: '+971',
    locale: 'ar-AE',
  },
  {
    code: 'EC',
    name: 'Ecuador',
    flag: '🇪🇨',
    currency: 'USD',
    symbol: '$',
    rate: 1, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Guayaquil', label: 'Quito / Guayaquil', utcOffset: 'UTC-5' },
    ],
    taxName: 'IVA',
    taxRate: 15,
    reducedTaxRate: 0,
    specialTaxRate: 15,
    simplifiedRegimeName: 'RIMPE Negocio Popular',
    taxIdName: 'RUC',
    phonePrefix: '+593',
    locale: 'es-EC',
  },
  {
    code: 'PY',
    name: 'Paraguay',
    flag: '🇵🇾',
    currency: 'PYG',
    symbol: '₲',
    rate: 7300, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Asuncion', label: 'Asunción', utcOffset: 'UTC-3' },
    ],
    taxName: 'IVA',
    taxRate: 10,
    reducedTaxRate: 5,
    specialTaxRate: 10,
    simplifiedRegimeName: 'Pequeño contribuyente (IRP)',
    taxIdName: 'RUC',
    phonePrefix: '+595',
    locale: 'es-PY',
  },
  {
    code: 'UY',
    name: 'Uruguay',
    flag: '🇺🇾',
    currency: 'UYU',
    symbol: '$U',
    rate: 40, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Montevideo', label: 'Montevideo', utcOffset: 'UTC-3' },
    ],
    taxName: 'IVA',
    taxRate: 22,
    reducedTaxRate: 10,
    specialTaxRate: 22,
    simplifiedRegimeName: 'Monotributo',
    taxIdName: 'RUT',
    phonePrefix: '+598',
    locale: 'es-UY',
  },
  {
    code: 'VE',
    name: 'Venezuela',
    flag: '🇻🇪',
    currency: 'VES',
    symbol: 'Bs.',
    rate: 200, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Caracas', label: 'Caracas', utcOffset: 'UTC-4' },
    ],
    taxName: 'IVA',
    taxRate: 16,
    reducedTaxRate: 8,
    specialTaxRate: 31,
    simplifiedRegimeName: 'Contribuyente formal / exento',
    taxIdName: 'RIF',
    phonePrefix: '+58',
    locale: 'es-VE',
  },
  {
    code: 'GT',
    name: 'Guatemala',
    flag: '🇬🇹',
    currency: 'GTQ',
    symbol: 'Q',
    rate: 7.7, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Guatemala', label: 'Ciudad de Guatemala', utcOffset: 'UTC-6' },
    ],
    taxName: 'IVA',
    taxRate: 12,
    reducedTaxRate: 0,
    specialTaxRate: 12,
    simplifiedRegimeName: 'Pequeño contribuyente (5%)',
    taxIdName: 'NIT',
    phonePrefix: '+502',
    locale: 'es-GT',
  },
  {
    code: 'HN',
    name: 'Honduras',
    flag: '🇭🇳',
    currency: 'HNL',
    symbol: 'L',
    rate: 26, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Tegucigalpa', label: 'Tegucigalpa / San Pedro Sula', utcOffset: 'UTC-6' },
    ],
    taxName: 'ISV',
    taxRate: 15,
    reducedTaxRate: 0,
    specialTaxRate: 18,
    simplifiedRegimeName: 'Régimen simplificado',
    taxIdName: 'RTN',
    phonePrefix: '+504',
    locale: 'es-HN',
  },
  {
    code: 'SV',
    name: 'El Salvador',
    flag: '🇸🇻',
    currency: 'USD',
    symbol: '$',
    rate: 1, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/El_Salvador', label: 'San Salvador', utcOffset: 'UTC-6' },
    ],
    taxName: 'IVA',
    taxRate: 13,
    reducedTaxRate: 0,
    specialTaxRate: 13,
    simplifiedRegimeName: 'Pequeño contribuyente',
    taxIdName: 'NIT',
    phonePrefix: '+503',
    locale: 'es-SV',
  },
  {
    code: 'NI',
    name: 'Nicaragua',
    flag: '🇳🇮',
    currency: 'NIO',
    symbol: 'C$',
    rate: 36.6, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Managua', label: 'Managua', utcOffset: 'UTC-6' },
    ],
    taxName: 'IVA',
    taxRate: 15,
    reducedTaxRate: 0,
    specialTaxRate: 15,
    simplifiedRegimeName: 'Régimen de cuota fija',
    taxIdName: 'RUC',
    phonePrefix: '+505',
    locale: 'es-NI',
  },
  {
    code: 'CR',
    name: 'Costa Rica',
    flag: '🇨🇷',
    currency: 'CRC',
    symbol: '₡',
    rate: 505, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Costa_Rica', label: 'San José', utcOffset: 'UTC-6' },
    ],
    taxName: 'IVA',
    taxRate: 13,
    reducedTaxRate: 4,
    specialTaxRate: 13,
    simplifiedRegimeName: 'Régimen simplificado',
    taxIdName: 'Cédula jurídica',
    phonePrefix: '+506',
    locale: 'es-CR',
  },
  {
    code: 'PA',
    name: 'Panamá',
    flag: '🇵🇦',
    currency: 'USD',
    symbol: 'B/.',
    rate: 1, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Panama', label: 'Ciudad de Panamá', utcOffset: 'UTC-5' },
    ],
    taxName: 'ITBMS',
    taxRate: 7,
    reducedTaxRate: 0,
    specialTaxRate: 10,
    simplifiedRegimeName: 'Pequeño contribuyente (exento)',
    taxIdName: 'RUC',
    phonePrefix: '+507',
    locale: 'es-PA',
  },
  {
    code: 'DO',
    name: 'República Dominicana',
    flag: '🇩🇴',
    currency: 'DOP',
    symbol: 'RD$',
    rate: 63, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Santo_Domingo', label: 'Santo Domingo / Santiago', utcOffset: 'UTC-4' },
    ],
    taxName: 'ITBIS',
    taxRate: 18,
    reducedTaxRate: 16,
    specialTaxRate: 18,
    simplifiedRegimeName: 'RST (Régimen Simplificado)',
    taxIdName: 'RNC',
    phonePrefix: '+1',
    locale: 'es-DO',
  },
  {
    code: 'PR',
    name: 'Puerto Rico',
    flag: '🇵🇷',
    currency: 'USD',
    symbol: '$',
    rate: 1, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Puerto_Rico', label: 'San Juan', utcOffset: 'UTC-4' },
    ],
    taxName: 'IVU',
    taxRate: 11.5,
    reducedTaxRate: 0,
    specialTaxRate: 11.5,
    simplifiedRegimeName: 'Comerciante exento',
    taxIdName: 'EIN / Núm. Comerciante',
    phonePrefix: '+1',
    locale: 'es-PR',
  },
  {
    code: 'CU',
    name: 'Cuba',
    flag: '🇨🇺',
    currency: 'CUP',
    symbol: '$',
    rate: 120, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Havana', label: 'La Habana', utcOffset: 'UTC-5' },
    ],
    taxName: 'Impuesto sobre ventas',
    taxRate: 10,
    reducedTaxRate: 0,
    specialTaxRate: 10,
    simplifiedRegimeName: 'Trabajador por cuenta propia',
    taxIdName: 'NIT',
    phonePrefix: '+53',
    locale: 'es-CU',
  },
  {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    symbol: 'C$',
    rate: 1.38, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'America/Toronto', label: 'Eastern (Toronto / Montréal)', utcOffset: 'UTC-5' },
      { tz: 'America/Winnipeg', label: 'Central (Winnipeg)', utcOffset: 'UTC-6' },
      { tz: 'America/Edmonton', label: 'Mountain (Calgary / Edmonton)', utcOffset: 'UTC-7' },
      { tz: 'America/Vancouver', label: 'Pacific (Vancouver)', utcOffset: 'UTC-8' },
    ],
    taxName: 'GST/HST',
    taxRate: 5,
    reducedTaxRate: 0,
    specialTaxRate: 15,
    simplifiedRegimeName: 'Small supplier (exempt)',
    taxIdName: 'BN',
    phonePrefix: '+1',
    locale: 'en-CA',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    symbol: '£',
    rate: 0.78, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'Europe/London', label: 'London', utcOffset: 'UTC+0' },
    ],
    taxName: 'VAT',
    taxRate: 20,
    reducedTaxRate: 5,
    specialTaxRate: 20,
    simplifiedRegimeName: 'Below VAT threshold',
    taxIdName: 'VAT Number',
    phonePrefix: '+44',
    locale: 'en-GB',
  },
  {
    code: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'Europe/Lisbon', label: 'Lisboa / Porto', utcOffset: 'UTC+0' },
    ],
    taxName: 'IVA',
    taxRate: 23,
    reducedTaxRate: 6,
    specialTaxRate: 23,
    simplifiedRegimeName: 'Regime de isenção (art. 53.º)',
    taxIdName: 'NIF',
    phonePrefix: '+351',
    locale: 'pt-PT',
  },
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    symbol: '₹',
    rate: 87, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'Asia/Kolkata', label: 'New Delhi / Mumbai', utcOffset: 'UTC+5:30' },
    ],
    taxName: 'GST',
    taxRate: 18,
    reducedTaxRate: 5,
    specialTaxRate: 28,
    simplifiedRegimeName: 'Composition Scheme',
    taxIdName: 'GSTIN',
    phonePrefix: '+91',
    locale: 'hi-IN',
  },
  {
    code: 'KR',
    name: 'South Korea',
    flag: '🇰🇷',
    currency: 'KRW',
    symbol: '₩',
    rate: 1400, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'Asia/Seoul', label: 'Seoul', utcOffset: 'UTC+9' },
    ],
    taxName: 'VAT',
    taxRate: 10,
    reducedTaxRate: 0,
    specialTaxRate: 10,
    simplifiedRegimeName: 'Simplified taxpayer',
    taxIdName: 'BRN',
    phonePrefix: '+82',
    locale: 'ko-KR',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    currency: 'SAR',
    symbol: '﷼',
    rate: 3.75, // referencial: se reemplaza con la tasa en vivo
    timezones: [
      { tz: 'Asia/Riyadh', label: 'Riyadh / Jeddah', utcOffset: 'UTC+3' },
    ],
    taxName: 'VAT',
    taxRate: 15,
    reducedTaxRate: 0,
    specialTaxRate: 15,
    simplifiedRegimeName: 'Below VAT threshold',
    taxIdName: 'VAT Number',
    phonePrefix: '+966',
    locale: 'ar-SA',
  },
];

export const LANGUAGES: { code: LangCode; name: string; flag: string }[] = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', name: '中文 (Chino)', flag: '🇨🇳' },
  { code: 'ja', name: '日本語 (Japonés)', flag: '🇯🇵' },
  { code: 'ru', name: 'Русский (Ruso)', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية (Árabe)', flag: '🇸🇦' },
  { code: 'ko', name: '한국어 (Coreano)', flag: '🇰🇷' },
  { code: 'hi', name: 'हिन्दी (Hindi)', flag: '🇮🇳' },
];

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface LangContextType {
  lang: LangCode;
  isEs: boolean;
  setLanguage: (lang: LangCode) => void;
  country: CountryConfig;
  setCountryByCode: (code: CountryCode) => void;
  selectedTimezone: TimezoneOption;
  setSelectedTimezoneByTz: (tz: string) => void;
  activeRate: number;
  officialRate: number;
  setCustomRate: (rate: number) => void;
  resetRateToOfficial: () => void;
  syncOfficialRatesNow: () => Promise<void>;
  lastRateSync: string;
  currencyMode: CurrencyMode;
  setCurrencyMode: (mode: CurrencyMode) => void;
  taxRegime: TaxRegimeId;
  setTaxRegime: (regime: TaxRegimeId) => void;
  businessSector: BusinessSectorId;
  setBusinessSector: (sector: BusinessSectorId) => void;
  effectiveTaxRate: number;
  formatMoney: (amountInUsd: number, applyTax?: boolean, whole?: boolean) => string;
  localTime: string;
}

const LanguageContext = createContext<LangContextType>({
  lang: 'es',
  isEs: true,
  setLanguage: () => {},
  country: COUNTRIES[0],
  setCountryByCode: () => {},
  selectedTimezone: COUNTRIES[0].timezones[0],
  setSelectedTimezoneByTz: () => {},
  activeRate: COUNTRIES[0].rate,
  officialRate: COUNTRIES[0].rate,
  setCustomRate: () => {},
  resetRateToOfficial: () => {},
  syncOfficialRatesNow: async () => {},
  lastRateSync: 'Oficial',
  currencyMode: 'dual',
  setCurrencyMode: () => {},
  taxRegime: 'general',
  setTaxRegime: () => {},
  businessSector: 'standard',
  setBusinessSector: () => {},
  effectiveTaxRate: COUNTRIES[0].taxRate,
  formatMoney: (n) => `$${n}`,
  localTime: '--:--:--',
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<LangCode>('es');
  const [countryCode, setCountryCode] = useState<CountryCode>('BO');
  const [customTz, setCustomTz] = useState<string>(COUNTRIES[0].timezones[0].tz);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [lastRateSync, setLastRateSync] = useState<string>('Base');
  const [customRate, setCustomRateState] = useState<number | null>(null);
  const [currencyMode, setCurrencyModeState] = useState<CurrencyMode>('dual');
  const [taxRegime, setTaxRegimeState] = useState<TaxRegimeId>('general');
  const [businessSector, setBusinessSectorState] = useState<BusinessSectorId>('standard');
  const localTime = ''; // el reloj vive solo en la pantalla que lo muestra (useDeviceClock)

  const rawCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  const officialRate = liveRates[rawCountry.currency] || rawCountry.rate;
  const activeRate = customRate !== null && customRate > 0 ? customRate : officialRate;

  // Cálculo automático de IVA según Régimen (General vs Simplificado/Exento) y Rubro
  let effectiveTaxRate = rawCountry.taxRate;
  if (taxRegime === 'simplified' || taxRegime === 'exempt') {
    effectiveTaxRate = 0;
  } else if (businessSector === 'essential') {
    effectiveTaxRate = rawCountry.reducedTaxRate;
  } else if (businessSector === 'special') {
    effectiveTaxRate = rawCountry.specialTaxRate;
  }

  // Sobrescribe country.taxRate y country.rate dinámicamente para que todas las vistas reciban el valor automático
  const country: CountryConfig = {
    ...rawCountry,
    rate: officialRate,
    taxRate: effectiveTaxRate,
  };

  const selectedTimezone =
    country.timezones.find((tzObj) => tzObj.tz === customTz) || country.timezones[0];

  // Motor de actualización de divisas cada 24 horas contra banco de datos cambiario
  const syncOfficialRatesNow = useCallback(async () => {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.rates) {
        const roundedRates: Record<string, number> = {};
        Object.keys(data.rates).forEach((curr) => {
          const val = Number(data.rates[curr]);
          roundedRates[curr] = val >= 100 ? Math.round(val) : Number(val.toFixed(2));
        });
        // Bolivia: el oficial del BCB manda sobre la fuente internacional
        try {
          const bcb = await fetch('/api/fx/bob');
          if (bcb.ok) {
            const j = await bcb.json();
            if (typeof j.rate === 'number' && j.rate > 0) roundedRates.BOB = Number(j.rate.toFixed(2));
          }
        } catch {
          // sin conexión al BCB: se queda la tasa internacional
        }
        const nowTs = Date.now();
        setLiveRates(roundedRates);
        localStorage.setItem('veltrix_fx_rates', JSON.stringify(roundedRates));
        localStorage.setItem('veltrix_fx_timestamp', String(nowTs));
        setLastRateSync(
          new Date(nowTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      }
    } catch {
      // Si no hay internet, usa las tasas oficiales guardadas o de respaldo sin romper la app
    }
  }, []);

  useEffect(() => {
    const savedLang = localStorage.getItem('veltrix_lang') as LangCode | null;
    if (savedLang && LANGUAGES.some((l) => l.code === savedLang)) setLang(savedLang);

    const savedMode = localStorage.getItem('veltrix_curr_mode') as CurrencyMode | null;
    if (savedMode === 'local' || savedMode === 'dual' || savedMode === 'anchor') {
      setCurrencyModeState(savedMode);
    }

    const savedRegime = localStorage.getItem('veltrix_tax_regime') as TaxRegimeId | null;
    if (savedRegime === 'general' || savedRegime === 'simplified' || savedRegime === 'exempt') {
      setTaxRegimeState(savedRegime);
    }

    const savedSector = localStorage.getItem('veltrix_sector') as BusinessSectorId | null;
    if (savedSector === 'standard' || savedSector === 'essential' || savedSector === 'special') {
      setBusinessSectorState(savedSector);
    }

    const savedCountry = localStorage.getItem('veltrix_country') as CountryCode | null;
    const foundCountry = COUNTRIES.find((c) => c.code === savedCountry);
    // Sin elección guardada: país (y su idioma, si tampoco eligió idioma) según la ubicación de la conexión;
    // si no se puede, por la zona horaria del dispositivo. Una elección manual siempre manda.
    if (!foundCountry) {
      const apply = (code: string | null) => {
        const c = COUNTRIES.find((x) => x.code === code);
        if (!c) return false;
        const devTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setCountryCode(c.code);
        setCustomTz(c.timezones.some((t) => t.tz === devTz) ? devTz : c.timezones[0].tz);
        if (!savedLang) {
          const base = (c.locale ?? 'en').split('-')[0] as LangCode;
          setLang(LANGUAGES.some((l) => l.code === base) ? base : 'en');
        }
        try { sessionStorage.setItem('veltrix_geo', c.code); } catch {}
        return true;
      };
      const byTz = () => {
        const devTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const c = COUNTRIES.find((x) => x.timezones.some((t) => t.tz === devTz));
        apply(c?.code ?? null);
      };
      let cached: string | null = null;
      try { cached = sessionStorage.getItem('veltrix_geo'); } catch {}
      if (!cached || !apply(cached)) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2500);
        fetch('/api/geo', { signal: ctl.signal })
          .then((r) => r.json())
          .then((d: { country: string | null }) => { if (!apply(d.country)) byTz(); })
          .catch(byTz)
          .finally(() => clearTimeout(timer));
      }
    }
    if (foundCountry) {
      setCountryCode(foundCountry.code);
      const savedTz = localStorage.getItem('veltrix_tz');
      if (savedTz && foundCountry.timezones.some((t) => t.tz === savedTz)) {
        setCustomTz(savedTz);
      } else {
        setCustomTz(foundCountry.timezones[0].tz);
      }
      const savedRate = localStorage.getItem(`veltrix_rate_${foundCountry.code}`);
      if (savedRate && !isNaN(parseFloat(savedRate))) {
        setCustomRateState(parseFloat(savedRate));
      }
    }

    // Verificar si las tasas guardadas tienen menos de 24 horas
    const cachedRates = localStorage.getItem('veltrix_fx_rates');
    const cachedTs = Number(localStorage.getItem('veltrix_fx_timestamp') || '0');
    if (cachedRates) {
      try {
        setLiveRates(JSON.parse(cachedRates));
        if (cachedTs > 0) {
          setLastRateSync(
            new Date(cachedTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          );
        }
      } catch {}
    }

    if (Date.now() - cachedTs >= TWENTY_FOUR_HOURS_MS || !cachedRates) {
      syncOfficialRatesNow();
    }
  }, [syncOfficialRatesNow]);


  const setLanguage = (newLang: LangCode) => {
    localStorage.setItem('veltrix_lang', newLang);
    setLang(newLang);
    // Forzamos un re-renderizado global del estado de idioma de forma limpia
    window.dispatchEvent(new Event('storage'));
  };
  
  const setCountryByCode = (code: CountryCode) => {
    const nextCountry = COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
    localStorage.setItem('veltrix_country', code);
    localStorage.setItem('veltrix_tz', nextCountry.timezones[0].tz);
    setCountryCode(code);
    setCustomTz(nextCountry.timezones[0].tz);

    const savedRate = localStorage.getItem(`veltrix_rate_${code}`);
    if (savedRate && !isNaN(parseFloat(savedRate))) {
      setCustomRateState(parseFloat(savedRate));
    } else {
      setCustomRateState(null);
    }
  };

  const setSelectedTimezoneByTz = (tz: string) => {
    localStorage.setItem('veltrix_tz', tz);
    setCustomTz(tz);
  };

  const setCustomRate = (rate: number) => {
    setCustomRateState(rate);
    localStorage.setItem(`veltrix_rate_${rawCountry.code}`, String(rate));
  };

  const resetRateToOfficial = () => {
    setCustomRateState(null);
    localStorage.removeItem(`veltrix_rate_${rawCountry.code}`);
  };

  const setCurrencyMode = (mode: CurrencyMode) => {
    setCurrencyModeState(mode);
    localStorage.setItem('veltrix_curr_mode', mode);
  };

  const setTaxRegime = (regime: TaxRegimeId) => {
    setTaxRegimeState(regime);
    localStorage.setItem('veltrix_tax_regime', regime);
  };

  const setBusinessSector = (sector: BusinessSectorId) => {
    setBusinessSectorState(sector);
    localStorage.setItem('veltrix_sector', sector);
  };

  const formatMoney = (amountInUsd: number, applyTax = false, whole = false) => {
    const finalUsd = applyTax ? amountInUsd * (1 + effectiveTaxRate / 100) : amountInUsd;
    if (currencyMode === 'anchor' || rawCountry.currency === 'USD') {
      return `$${finalUsd.toFixed(whole ? 0 : 2)} USD`;
    }
    const converted = whole ? Math.round(finalUsd * activeRate) : finalUsd * activeRate;
    const decimals = whole || activeRate >= 100 ? 0 : 2;
    const formattedLocal = `${rawCountry.symbol} ${new Intl.NumberFormat(rawCountry.locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(converted)}`;

    if (currencyMode === 'dual') {
      return `${formattedLocal} ($${finalUsd.toFixed(0)})`;
    }
    return formattedLocal;
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isEs: lang === 'es',
        setLanguage,
        country,
        setCountryByCode,
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
        formatMoney,
        localTime,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

/** Reloj del propio dispositivo para una zona horaria; se actualiza 1 vez por minuto y solo donde se muestra */
export function useDeviceClock(locale: string, tz: string): string {
  const fmt = () => {
    try { return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
    catch { return new Date().toLocaleTimeString(); }
  };
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    setNow(fmt());
    const msToMinute = 60_000 - (Date.now() % 60_000);
    let iv: ReturnType<typeof setInterval> | undefined;
    const to = setTimeout(() => { setNow(fmt()); iv = setInterval(() => setNow(fmt()), 60_000); }, msToMinute);
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, tz]);
  return now;
}

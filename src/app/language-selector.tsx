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

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface LangContextType {
  lang: LangCode;
  isEs: boolean;
  setLanguage: (lang: LangCode) => void;
  t: typeof translations['es'];
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
  formatMoney: (amountInUsd: number, applyTax?: boolean) => string;
  localTime: string;
}

const LanguageContext = createContext<LangContextType>({
  lang: 'es',
  isEs: true,
  setLanguage: () => {},
  t: translations.es,
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
  const [localTime, setLocalTime] = useState<string>('--:--:--');

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
    if (savedLang && translations[savedLang]) setLang(savedLang);

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

  useEffect(() => {
    const updateClock = () => {
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat(rawCountry.locale, {
          timeZone: selectedTimezone.tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now);
        setLocalTime(formatted);
      } catch {
        setLocalTime(new Date().toLocaleTimeString());
      }
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [rawCountry.locale, selectedTimezone]);

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

  const formatMoney = (amountInUsd: number, applyTax = false) => {
    const finalUsd = applyTax ? amountInUsd * (1 + effectiveTaxRate / 100) : amountInUsd;
    if (currencyMode === 'anchor' || rawCountry.currency === 'USD') {
      return `$${finalUsd.toFixed(2)} USD`;
    }
    const converted = finalUsd * activeRate;
    const decimals = activeRate >= 100 ? 0 : 2;
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
        t: translations[lang] || translations.es,
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
    localTime,
    t,
  } = useLanguage();

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
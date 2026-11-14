// Textos legales de Veltrix. La versión en español es la oficial; la inglesa es una traducción.
// Antes de cambiar algo importante (precios, plazos, reembolsos) se avisa a los clientes con 15 días.
export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };
export type LegalKind = 'terms' | 'privacy' | 'refunds';

const UPDATED_ES = '13 de noviembre de 2026';
const UPDATED_EN = 'November 13, 2026';
const CONTACT = 'hola@veltrixsystem.app';

export const LEGAL: Record<'es' | 'en', Record<LegalKind, LegalDoc>> = {
  es: {
    terms: {
      title: 'Términos de servicio',
      updated: UPDATED_ES,
      intro: 'Estos términos regulan el uso de Veltrix System ("Veltrix", "nosotros"), un software en línea para administrar negocios, operado desde el Estado Plurinacional de Bolivia. Al crear una cuenta o usar Veltrix aceptas estos términos en nombre de tu negocio.',
      sections: [
        { h: '1. El servicio', p: [
          'Veltrix ofrece herramientas de ventas, caja, inventario, clientes, créditos y cobranza, restaurante, taller, tienda en línea, mensajería interna y complementos opcionales como Veltrix IA. Las funciones disponibles dependen del plan contratado.',
          'Veltrix es una herramienta de gestión. No es un banco, no presta dinero, no cobra deudas en tu nombre y no reemplaza a tu contador ni a la facturación fiscal exigida en tu país.',
        ] },
        { h: '2. Tu cuenta', p: [
          'Eres responsable de la información que registras, de los usuarios que creas para tu equipo y de mantener seguras las contraseñas. Cada usuario es personal y no debe compartirse.',
          'Debes ser mayor de 18 años y tener facultad para obligar al negocio que registras.',
        ] },
        { h: '3. Planes y límites', p: [
          'Cada plan tiene límites de empresas, sucursales, usuarios, almacenamiento, productos en la tienda en línea, historial del chat y otros recursos. Ningún plan es ilimitado. Al alcanzar un límite, Veltrix no permitirá agregar más hasta que cambies de plan o contrates extras.',
          'Los precios se publican en dólares estadounidenses, más los impuestos que correspondan en tu país. Pueden existir precios regionales.',
        ] },
        { h: '4. Pruebas, pilotos y precio de fundador', p: [
          'Las pruebas gratuitas y los periodos piloto no generan cobro. Al terminar, para seguir usando Veltrix debes contratar un plan.',
          'El precio de fundador es un descuento temporal por el plazo indicado al otorgarlo (por ejemplo, 12 meses). No es de por vida: al vencer se aplica el precio vigente del plan.',
        ] },
        { h: '5. Pagos', p: [
          'Los pagos con tarjeta se procesan a través de nuestro revendedor autorizado (Merchant of Record), que actúa como vendedor ante ti, cobra los impuestos de tu país y emite el comprobante. También podemos aceptar pagos por QR o transferencia.',
          'La suscripción se renueva automáticamente cada mes hasta que la canceles. Puedes cancelar en cualquier momento desde "Mi plan"; mantienes el acceso hasta el final del periodo pagado.',
        ] },
        { h: '6. Falta de pago y suspensión', p: [
          'Si un pago no se completa, tendrás 7 días de gracia. Después, la cuenta pasa a modo de solo lectura: puedes ver y exportar tu información, pero no registrar operaciones nuevas, hasta regularizar el pago.',
          'Conservamos los datos de una cuenta suspendida o cancelada al menos 90 días. Después podemos eliminarlos, previo aviso al correo de facturación.',
        ] },
        { h: '7. Uso aceptable', p: [
          'No puedes usar Veltrix para actividades ilegales, fraude, lavado de dinero, ni para almacenar contenido ajeno a la gestión de tu negocio.',
          'Si registras créditos, préstamos o cobranzas, eres el único responsable de cumplir las leyes de tu país (tasas de interés, protección al consumidor, cobranza respetuosa y protección de datos). Está prohibido usar Veltrix para hostigar, amenazar o exponer a deudores.',
          'Puedes subir fotos de documentos de identidad de tus clientes solo con su consentimiento y para fines legítimos de tu negocio.',
          'Podemos limitar o suspender una cuenta que afecte la seguridad o el funcionamiento del servicio para los demás clientes.',
        ] },
        { h: '8. Tus datos y los de tus clientes', p: [
          'La información que registras es tuya. Respecto de los datos de tus clientes y empleados, tú decides para qué se usan y nosotros los tratamos solo para prestarte el servicio, según nuestra Política de privacidad.',
          'Puedes exportar tu información mientras tu cuenta exista y durante el plazo de conservación posterior a la cancelación.',
        ] },
        { h: '9. Veltrix IA', p: [
          'Veltrix IA es un complemento pagado con un cupo mensual. Sus respuestas se basan en un resumen de los datos de tu empresa y son orientativas: pueden contener errores y no constituyen asesoría legal, contable ni financiera.',
        ] },
        { h: '10. Disponibilidad', p: [
          'Trabajamos para que Veltrix esté disponible y protegido, con copias de seguridad diarias, pero no garantizamos que funcione sin interrupciones. Las funciones sin conexión sincronizan cuando el dispositivo vuelve a tener internet.',
        ] },
        { h: '11. Responsabilidad', p: [
          'En la medida que la ley lo permita, nuestra responsabilidad total por cualquier reclamo se limita al monto que pagaste a Veltrix en los 3 meses anteriores al hecho que lo origina. No respondemos por pérdidas indirectas, lucro cesante ni por decisiones tomadas con base en la información registrada.',
        ] },
        { h: '12. Propiedad intelectual', p: [
          'El software, la marca Veltrix y su diseño nos pertenecen. Te otorgamos una licencia de uso no exclusiva mientras tu suscripción esté vigente.',
        ] },
        { h: '13. Cambios', p: [
          'Podemos actualizar estos términos. Si el cambio es importante, te avisaremos con al menos 15 días de anticipación por correo o dentro de la app.',
        ] },
        { h: '14. Ley aplicable y contacto', p: [
          `Estos términos se rigen por las leyes del Estado Plurinacional de Bolivia, sin perjuicio de los derechos irrenunciables que te otorgue la ley de tu país. Para cualquier consulta escríbenos a ${CONTACT}.`,
        ] },
      ],
    },
    privacy: {
      title: 'Política de privacidad',
      updated: UPDATED_ES,
      intro: 'Esta política explica qué datos trata Veltrix, para qué, con quién los comparte y qué derechos tienes.',
      sections: [
        { h: '1. Qué datos tratamos', p: [
          'Datos de la cuenta: nombre, correo, teléfono, empresa, país y datos de facturación.',
          'Datos del negocio que tú registras: productos, ventas, cobros, caja, inventario, clientes, créditos, rutas, mensajes del equipo y archivos.',
          'Datos de tus clientes que registras: nombre, documento, teléfono, dirección, deudas y, solo con su consentimiento, foto del documento o de la persona.',
          'Datos técnicos: tipo de dispositivo, idioma, registros de acceso y de errores, necesarios para la seguridad y el funcionamiento.',
        ] },
        { h: '2. Para qué los usamos', p: [
          'Para prestarte el servicio, mantener tu cuenta segura, cobrar la suscripción, darte soporte, enviarte avisos importantes y mejorar Veltrix. No vendemos datos personales ni los usamos para publicidad de terceros.',
          'Respecto de los datos de tus clientes y empleados, actuamos por cuenta tuya: solo los usamos para prestarte el servicio.',
        ] },
        { h: '3. Con quién los compartimos', p: [
          'Con proveedores que nos ayudan a operar, bajo obligaciones de confidencialidad: Supabase (base de datos y archivos), Vercel (alojamiento de la app), Resend (envío de correos), Lemon Squeezy (procesamiento de pagos) y Anthropic (solo si tu empresa activa Veltrix IA: recibe un resumen de datos de tu negocio para responder, sin fotos ni documentos).',
          'Algunos de estos proveedores procesan datos fuera de tu país. Elegimos proveedores con medidas de seguridad reconocidas.',
          'También podemos entregar datos si una autoridad competente lo exige conforme a la ley.',
        ] },
        { h: '4. Seguridad', p: [
          'Usamos conexiones cifradas, control de acceso por empresa y por rol (cada usuario ve solo lo que le corresponde), archivos privados con enlaces temporales y copias de seguridad diarias.',
        ] },
        { h: '5. Cuánto tiempo los guardamos', p: [
          'Mientras tu cuenta esté activa. El chat del equipo se borra según el plazo de tu plan (30, 90 o 365 días). Tras cancelar, conservamos los datos al menos 90 días para que puedas recuperarlos o exportarlos; luego los eliminamos, salvo los registros de facturación que la ley obligue a conservar.',
        ] },
        { h: '6. Tus derechos', p: [
          `Puedes pedir acceso, corrección, exportación o eliminación de tus datos escribiendo a ${CONTACT}. Si eres cliente de un negocio que usa Veltrix, dirígete primero a ese negocio, que es quien decide sobre tus datos; nosotros lo ayudaremos a responderte.`,
        ] },
        { h: '7. Almacenamiento en tu dispositivo', p: [
          'Guardamos en tu navegador solo lo necesario: la sesión, el idioma, el tema y, para el cobrador, los datos del día para trabajar sin conexión. No usamos cookies de publicidad.',
        ] },
        { h: '8. Menores de edad', p: [
          'Veltrix está dirigido a negocios y no debe ser usado por menores de 18 años.',
        ] },
        { h: '9. Cambios', p: [
          'Si cambiamos esta política de forma importante, te avisaremos por correo o dentro de la app.',
        ] },
      ],
    },
    refunds: {
      title: 'Política de reembolsos',
      updated: UPDATED_ES,
      intro: 'Queremos que pagues solo por algo que te sirve. Estas son nuestras reglas de reembolso.',
      sections: [
        { h: '1. Prueba gratis', p: [
          'Puedes probar Veltrix gratis antes de pagar. Durante la prueba o el periodo piloto no se cobra nada.',
        ] },
        { h: '2. Primer pago', p: [
          'Si es el primer pago de tu suscripción y nos pides el reembolso dentro de los 7 días siguientes, te devolvemos el 100 %.',
        ] },
        { h: '3. Renovaciones', p: [
          'Puedes cancelar cuando quieras desde "Mi plan" y no se te volverá a cobrar. Mantienes el acceso hasta el final del periodo ya pagado. No hacemos devoluciones parciales por los días no usados de un mes ya iniciado, salvo que la ley de tu país lo exija.',
        ] },
        { h: '4. Cobros por error', p: [
          'Si se te cobró dos veces, se te cobró después de cancelar o hubo un error nuestro, te devolvemos el monto completo.',
        ] },
        { h: '5. Complementos', p: [
          'Las preguntas de Veltrix IA ya usadas y los extras ya consumidos del mes no son reembolsables.',
        ] },
        { h: '6. Cómo pedirlo', p: [
          `Escríbenos a ${CONTACT} desde el correo de tu cuenta, con el nombre de tu empresa. El reembolso se hace al mismo medio de pago y suele tardar entre 5 y 10 días hábiles, según tu banco.`,
          'Nada de esta política limita los derechos que te otorgue la ley de protección al consumidor de tu país.',
        ] },
      ],
    },
  },
  en: {
    terms: {
      title: 'Terms of Service',
      updated: UPDATED_EN,
      intro: 'These terms govern the use of Veltrix System ("Veltrix", "we"), online business management software operated from the Plurinational State of Bolivia. By creating an account or using Veltrix you accept these terms on behalf of your business. The Spanish version is the official one.',
      sections: [
        { h: '1. The service', p: [
          'Veltrix provides tools for sales, cash registers, inventory, customers, credit and collections, restaurants, workshops, online store, team messaging and optional add-ons such as Veltrix AI. Available features depend on your plan.',
          'Veltrix is a management tool. It is not a bank, does not lend money, does not collect debts on your behalf and does not replace your accountant or the tax invoicing required in your country.',
        ] },
        { h: '2. Your account', p: [
          'You are responsible for the information you enter, the users you create for your team and keeping passwords secure. Each user is personal and must not be shared.',
          'You must be at least 18 and authorized to bind the business you register.',
        ] },
        { h: '3. Plans and limits', p: [
          'Each plan has limits on companies, branches, users, storage, online store products, chat history and other resources. No plan is unlimited. When you reach a limit, Veltrix will not allow adding more until you upgrade or buy extras.',
          'Prices are published in US dollars, plus any taxes that apply in your country. Regional prices may apply.',
        ] },
        { h: '4. Trials, pilots and founder pricing', p: [
          'Free trials and pilot periods are not charged. When they end, you must subscribe to keep using Veltrix.',
          'Founder pricing is a temporary discount for the period stated when granted (for example, 12 months). It is not lifetime: afterwards the current plan price applies.',
        ] },
        { h: '5. Payments', p: [
          'Card payments are processed by our authorized reseller (Merchant of Record), which acts as the seller to you, charges your local taxes and issues the receipt. We may also accept QR or bank transfer payments.',
          'Subscriptions renew automatically every month until cancelled. You can cancel anytime from "My plan" and keep access until the end of the paid period.',
        ] },
        { h: '6. Non-payment and suspension', p: [
          'If a payment fails you get a 7-day grace period. After that the account becomes read-only: you can view and export your information but not record new operations until payment is settled.',
          'We keep data from suspended or cancelled accounts for at least 90 days. After that we may delete it, with prior notice to the billing email.',
        ] },
        { h: '7. Acceptable use', p: [
          'You may not use Veltrix for illegal activities, fraud, money laundering, or to store content unrelated to managing your business.',
          'If you record credit, loans or collections, you alone are responsible for complying with your local laws (interest rates, consumer protection, respectful collection and data protection). Using Veltrix to harass, threaten or expose debtors is forbidden.',
          'You may upload photos of your customers’ ID documents only with their consent and for legitimate business purposes.',
          'We may limit or suspend an account that affects the security or operation of the service for other customers.',
        ] },
        { h: '8. Your data and your customers’ data', p: [
          'The information you enter is yours. For your customers’ and employees’ data, you decide how it is used and we process it only to provide the service, as described in our Privacy Policy.',
          'You can export your information while your account exists and during the retention period after cancellation.',
        ] },
        { h: '9. Veltrix AI', p: [
          'Veltrix AI is a paid add-on with a monthly quota. Its answers are based on a summary of your company’s data and are for guidance only: they may contain errors and are not legal, accounting or financial advice.',
        ] },
        { h: '10. Availability', p: [
          'We work to keep Veltrix available and secure, with daily backups, but we do not guarantee uninterrupted operation. Offline features sync when the device is back online.',
        ] },
        { h: '11. Liability', p: [
          'To the extent permitted by law, our total liability for any claim is limited to the amount you paid Veltrix in the 3 months before the event giving rise to it. We are not liable for indirect losses, lost profits or decisions made based on recorded information.',
        ] },
        { h: '12. Intellectual property', p: [
          'The software, the Veltrix brand and its design belong to us. We grant you a non-exclusive license to use it while your subscription is active.',
        ] },
        { h: '13. Changes', p: [
          'We may update these terms. For material changes we will notify you at least 15 days in advance by email or in the app.',
        ] },
        { h: '14. Governing law and contact', p: [
          `These terms are governed by the laws of the Plurinational State of Bolivia, without prejudice to any non-waivable rights granted by the law of your country. For any question write to ${CONTACT}.`,
        ] },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      updated: UPDATED_EN,
      intro: 'This policy explains what data Veltrix processes, why, who we share it with and your rights. The Spanish version is the official one.',
      sections: [
        { h: '1. Data we process', p: [
          'Account data: name, email, phone, company, country and billing details.',
          'Business data you enter: products, sales, payments, cash register, inventory, customers, credit, routes, team messages and files.',
          'Your customers’ data you enter: name, ID number, phone, address, debts and, only with their consent, a photo of their ID or of the person.',
          'Technical data: device type, language, access and error logs, needed for security and operation.',
        ] },
        { h: '2. Why we use it', p: [
          'To provide the service, keep your account secure, charge the subscription, give support, send important notices and improve Veltrix. We do not sell personal data or use it for third-party advertising.',
          'For your customers’ and employees’ data, we act on your behalf and only use it to provide the service to you.',
        ] },
        { h: '3. Who we share it with', p: [
          'Providers that help us operate, under confidentiality obligations: Supabase (database and files), Vercel (app hosting), Resend (email delivery), Lemon Squeezy (payment processing) and Anthropic (only if your company enables Veltrix AI: it receives a summary of your business data to answer, without photos or documents).',
          'Some of these providers process data outside your country. We choose providers with recognized security measures.',
          'We may also disclose data when required by a competent authority under the law.',
        ] },
        { h: '4. Security', p: [
          'We use encrypted connections, access control per company and role (each user sees only what they should), private files with temporary links and daily backups.',
        ] },
        { h: '5. Retention', p: [
          'While your account is active. Team chat is deleted according to your plan (30, 90 or 365 days). After cancellation we keep data for at least 90 days so you can recover or export it; then we delete it, except billing records the law requires us to keep.',
        ] },
        { h: '6. Your rights', p: [
          `You can request access, correction, export or deletion of your data by writing to ${CONTACT}. If you are a customer of a business that uses Veltrix, contact that business first, since it decides about your data; we will help it respond.`,
        ] },
        { h: '7. Storage on your device', p: [
          'We store only what is needed in your browser: session, language, theme and, for collectors, the day’s data to work offline. We do not use advertising cookies.',
        ] },
        { h: '8. Minors', p: [
          'Veltrix is intended for businesses and must not be used by anyone under 18.',
        ] },
        { h: '9. Changes', p: [
          'If we change this policy materially, we will notify you by email or in the app.',
        ] },
      ],
    },
    refunds: {
      title: 'Refund Policy',
      updated: UPDATED_EN,
      intro: 'We want you to pay only for something that works for you. These are our refund rules. The Spanish version is the official one.',
      sections: [
        { h: '1. Free trial', p: ['You can try Veltrix for free before paying. Nothing is charged during the trial or pilot period.'] },
        { h: '2. First payment', p: ['If it is the first payment of your subscription and you ask for a refund within 7 days, we refund 100%.'] },
        { h: '3. Renewals', p: ['You can cancel anytime from "My plan" and you will not be charged again. You keep access until the end of the paid period. We do not give partial refunds for unused days of a month already started, unless required by your local law.'] },
        { h: '4. Charges made in error', p: ['If you were charged twice, charged after cancelling, or we made a mistake, we refund the full amount.'] },
        { h: '5. Add-ons', p: ['Veltrix AI questions already used and extras already consumed in the month are non-refundable.'] },
        { h: '6. How to request it', p: [
          `Write to ${CONTACT} from your account email with your company name. Refunds go back to the original payment method and usually take 5 to 10 business days, depending on your bank.`,
          'Nothing in this policy limits the rights granted to you by consumer protection law in your country.',
        ] },
      ],
    },
  },
};

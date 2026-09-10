import { Customer, MilkType } from '../types';

export interface ParsedWhatsAppCustomer {
  id: string;
  name: string;
  phone: string;
  displayPhone: string;
  defaultLitres: number;
  milkType: MilkType;
  ratePerLitre: number;
  isSelected: boolean;
  isExisting: boolean;
  existingCustomerId?: string;
  sourceNote?: string;
}

// Clean 10-digit Indian phone number extraction
export const cleanPhoneDigits = (raw?: string | null): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1, 11);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
};

// Format for display (e.g. "98765 43210")
export const formatDisplayPhone = (tenDigits: string): string => {
  if (tenDigits.length === 10) {
    return `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
  }
  return tenDigits;
};

// Check if a line is standard WhatsApp system message
const isWhatsAppSystemMessage = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('end-to-end encrypted') ||
    lower.includes('security code changed') ||
    lower.includes('messages and calls are end-to-end') ||
    lower.includes('created group') ||
    lower.includes('changed the group') ||
    lower.includes('changed the subject') ||
    lower.includes('changed this group') ||
    lower.includes('left') ||
    lower.includes('was removed') ||
    lower.includes('you were added')
  );
};

// Extract quantity in litres from message text (e.g. "2L", "1.5 litre", "2.5 लीटर", "1 ltr")
const extractLitres = (text: string): number => {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|litre|litres|लीटर|ली)/i);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    if (parsed > 0 && parsed <= 50) return parsed;
  }
  return 2.0; // Standard default 2.0 Litres
};

// Extract milk type from message text
const extractMilkType = (text: string): MilkType => {
  const lower = text.toLowerCase();
  if (lower.includes('buffalo') || lower.includes('भैंस') || lower.includes('bhes') || lower.includes('buff')) {
    return 'buffalo';
  }
  return 'cow'; // Default to Cow
};

// Clean name string
const cleanNameCandidate = (name: string): string => {
  let cleaned = name.trim();
  cleaned = cleaned.replace(/^[~"']+|[~"']+$/g, '').trim();
  cleaned = cleaned.replace(/[:\-–—]+$/, '').trim();
  cleaned = cleaned.replace(/^\d+[\.\)\-]\s*/, '').trim();
  return cleaned;
};

export const parseWhatsAppText = (
  rawText: string,
  existingCustomers: Customer[] = [],
  defaultCowRate = 55,
  defaultBuffaloRate = 70
): ParsedWhatsAppCustomer[] => {
  if (!rawText || !rawText.trim()) return [];

  const existingMap = new Map<string, Customer>();
  existingCustomers.forEach(c => {
    const norm = cleanPhoneDigits(c.phone);
    if (norm) existingMap.set(norm, c);
  });

  const extracted = new Map<string, {
    name: string;
    phone: string;
    litres: number;
    milkType: MilkType;
    source: string;
  }>();

  const lines = rawText.split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || isWhatsAppSystemMessage(trimmed)) return;

    // --- PATTERN 1: WhatsApp Chat Export Line ---
    const chatMatch = trimmed.match(/^(?:\[?\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[apAP][mM])?\]?\s*[-–—]?\s*)([^:]+)(?::\s*(.*))?$/);

    if (chatMatch) {
      const senderRaw = chatMatch[1].trim();
      const messageBody = chatMatch[2] ? chatMatch[2].trim() : '';

      // Check for joined/added notification
      const joinedMatch = senderRaw.match(/((?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})\s+(?:joined|added)/i);
      if (joinedMatch) {
        const phone = cleanPhoneDigits(joinedMatch[1]);
        if (phone.length === 10 && !extracted.has(phone)) {
          extracted.set(phone, {
            name: `Customer ${phone.slice(-4)}`,
            phone,
            litres: 2.0,
            milkType: 'cow',
            source: 'Group Member'
          });
        }
        return;
      }

      // Check if sender is a phone number with an optional Push Name
      const phoneWithPushMatch = senderRaw.match(/((?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})(?:\s*\((?:~)?([^\)]+)\))?/);
      if (phoneWithPushMatch) {
        const phone = cleanPhoneDigits(phoneWithPushMatch[1]);
        const pushName = phoneWithPushMatch[2] ? cleanNameCandidate(phoneWithPushMatch[2]) : '';

        if (phone.length === 10) {
          const detectedLitres = messageBody ? extractLitres(messageBody) : 2.0;
          const detectedMilkType = messageBody ? extractMilkType(messageBody) : 'cow';
          const existingExtracted = extracted.get(phone);

          const finalName = pushName || (existingExtracted && existingExtracted.name !== `Customer ${phone.slice(-4)}` ? existingExtracted.name : `Customer ${phone.slice(-4)}`);

          extracted.set(phone, {
            name: finalName,
            phone,
            litres: detectedLitres !== 2.0 ? detectedLitres : (existingExtracted?.litres || 2.0),
            milkType: detectedMilkType !== 'cow' ? detectedMilkType : (existingExtracted?.milkType || 'cow'),
            source: pushName ? `WhatsApp: ~${pushName}` : 'WhatsApp Group'
          });
          return;
        }
      }

      // Sender is a saved name, check if message body has phone number
      const phoneInMsgMatch = messageBody.match(/(?:\+91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})/);
      if (phoneInMsgMatch) {
        const phone = cleanPhoneDigits(phoneInMsgMatch[1]);
        if (phone.length === 10) {
          const detectedLitres = extractLitres(messageBody);
          const detectedMilkType = extractMilkType(messageBody);
          const name = cleanNameCandidate(senderRaw);

          extracted.set(phone, {
            name: name || `Customer ${phone.slice(-4)}`,
            phone,
            litres: detectedLitres,
            milkType: detectedMilkType,
            source: 'WhatsApp Message'
          });
          return;
        }
      }
    }

    // --- PATTERN 2: Direct Phone Numbers & Names anywhere in line ---
    const generalPhoneMatches = trimmed.matchAll(/(?:\+91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})/g);
    for (const pm of generalPhoneMatches) {
      const phone = cleanPhoneDigits(pm[0]);
      if (phone.length === 10 && !extracted.has(phone)) {
        let namePart = trimmed.replace(pm[0], '').replace(/\+91/g, '');
        namePart = namePart.replace(/(\d+(?:\.\d+)?)\s*(?:l|ltr|litre|लीटर|ली)/gi, '');
        namePart = namePart.replace(/(cow|गाय|buffalo|भैंस|bhes)/gi, '');
        namePart = cleanNameCandidate(namePart);

        const detectedLitres = extractLitres(trimmed);
        const detectedMilkType = extractMilkType(trimmed);

        const finalName = (namePart && namePart.length >= 2 && !/^\d+$/.test(namePart))
          ? namePart
          : `Customer ${phone.slice(-4)}`;

        extracted.set(phone, {
          name: finalName,
          phone,
          litres: detectedLitres,
          milkType: detectedMilkType,
          source: 'WhatsApp Text'
        });
      }
    }
  });

  const result: ParsedWhatsAppCustomer[] = [];
  extracted.forEach((item, phone) => {
    const existingCust = existingMap.get(phone);
    const isExisting = !!existingCust;
    const rate = item.milkType === 'buffalo' ? defaultBuffaloRate : defaultCowRate;

    result.push({
      id: `wa_${phone}_${Date.now()}`,
      name: isExisting ? existingCust.name : item.name,
      phone,
      displayPhone: formatDisplayPhone(phone),
      defaultLitres: isExisting ? existingCust.defaultLitres : item.litres,
      milkType: isExisting ? existingCust.milkType : item.milkType,
      ratePerLitre: isExisting ? existingCust.ratePerLitre : rate,
      isSelected: !isExisting,
      isExisting,
      existingCustomerId: existingCust?.id,
      sourceNote: item.source
    });
  });

  return result.sort((a, b) => {
    if (a.isExisting === b.isExisting) return a.name.localeCompare(b.name);
    return a.isExisting ? 1 : -1;
  });
};

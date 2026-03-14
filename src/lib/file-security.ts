/** SEC-WEB-2: 파일 업로드 보안 — 악성코드 차단 */

// ─── 허용 파일 정의 ───
export const ALLOWED_FILE_TYPES: Record<string, { mimes: string[]; extensions: string[]; maxSizeMB: number }> = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSizeMB: 10,
  },
  document: {
    mimes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/haansofthwp',
      'application/x-hwp',
    ],
    extensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.hwp'],
    maxSizeMB: 20,
  },
  design: {
    mimes: ['application/pdf', 'image/jpeg', 'image/png'],
    extensions: ['.pdf', '.jpg', '.png', '.dwg'],
    maxSizeMB: 50,
  },
};

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/** 7단계 파일 검증 */
export async function validateUploadFile(
  file: File,
  category: 'image' | 'document' | 'design'
): Promise<FileValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = ALLOWED_FILE_TYPES[category];

  // Step 1: 확장자 검증
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!config.extensions.includes(ext)) {
    errors.push(`허용되지 않는 파일 형식입니다. (허용: ${config.extensions.join(', ')})`);
  }

  // Step 2: MIME 타입 검증
  if (file.type && !config.mimes.includes(file.type)) {
    errors.push(`파일 MIME 타입이 올바르지 않습니다. (${file.type})`);
  }

  // Step 3: 크기 제한
  const maxBytes = config.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    errors.push(`파일 크기가 ${config.maxSizeMB}MB를 초과합니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  // Step 4: 매직 바이트 검증
  const magicValid = await checkMagicBytes(file);
  if (!magicValid.valid) {
    errors.push(`파일 내용이 확장자(${ext})와 일치하지 않습니다. 위변조된 파일일 수 있습니다.`);
  }

  // Step 5: 이중 확장자 탐지
  const nameParts = file.name.split('.');
  if (nameParts.length > 2) {
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.ps1', '.sh', '.msi', '.dll', '.com'];
    for (const part of nameParts.slice(0, -1)) {
      if (suspiciousExtensions.some(s => s === '.' + part.toLowerCase())) {
        errors.push(`이중 확장자가 감지되었습니다. (${file.name}) — 악성 파일일 수 있습니다.`);
        break;
      }
    }
  }

  // Step 6: 파일명 위험 문자 검증
  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (dangerousChars.test(file.name)) {
    warnings.push('파일명에 특수문자가 포함되어 있어 자동으로 정리됩니다.');
  }

  // Step 7: 실행 파일 완전 차단
  const executableExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.mst',
    '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
    '.ps1', '.ps2', '.psc1', '.psc2', '.reg', '.inf', '.lnk',
    '.dll', '.sys', '.drv', '.ocx', '.cpl',
    '.sh', '.bash', '.csh', '.ksh', '.py', '.pl', '.rb',
    '.jar', '.class', '.apk', '.ipa', '.app', '.dmg',
  ];
  if (executableExtensions.includes(ext)) {
    errors.push(`실행 파일(${ext})은 업로드할 수 없습니다.`);
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/** 매직 바이트 검증 */
async function checkMagicBytes(file: File): Promise<{ valid: boolean; detectedType: string }> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { valid: file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name), detectedType: 'jpeg' };
  }
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { valid: file.type === 'image/png' || file.name.endsWith('.png'), detectedType: 'png' };
  }
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { valid: file.type === 'image/gif' || file.name.endsWith('.gif'), detectedType: 'gif' };
  }
  // PDF: 25 50 44 46
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { valid: file.type === 'application/pdf' || file.name.endsWith('.pdf'), detectedType: 'pdf' };
  }
  // ZIP (docx, xlsx, pptx): 50 4B 03 04
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { valid: ['.docx', '.xlsx', '.pptx', '.zip'].some(e => file.name.toLowerCase().endsWith(e)), detectedType: 'zip/office' };
  }
  return { valid: true, detectedType: 'unknown' };
}

/** 안전한 파일명 생성 (UUID) */
export function sanitizeFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || '';
  const safeName = crypto.randomUUID();
  return `${safeName}.${ext}`;
}

/** 안전한 업로드 경로 생성 */
export function getSecureUploadPath(category: string, originalName: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const safeName = sanitizeFileName(originalName);
  return `${category}/${date}/${safeName}`;
}

export function buildLabelPrintCommand(imageData, width, height) {
  var grf = imageDataToGrf(imageData, width, height)
  var bytesPerLine = (width + 7) >> 3

  return `
^XA
^GFA,${bytesPerLine * height},${bytesPerLine * height},${bytesPerLine},${grf}
^FS
^XZ`
}

export function imageDataToGrf(imageData, width, height) {
  const R = 0
  const G = 1
  const B = 2
  const A = 3
  const THRESHOLD = 95

  // 이미지의 가로 한 줄당 바이트
  const bytesPerLine = (width + 7) >> 3 // var bytesPerLine = Math.ceil(width / 8)

  // 이미지 너비와 grf 포맷에서 사용할 비트의 차이
  const diff = (bytesPerLine << 3) - width

  // GRF 사이즈 = 가로 바이트 사이즈 * 세로
  const grfSize = bytesPerLine * height

  // 가로 한 줄당 최대 문자 수 (바이트 당 두 글자)
  const maxCharsOfLine = bytesPerLine << 1

  // GRF 사이즈 만큼의 배열 생성, GRF 문자열을 만들 때 사용, 메모리 확보
  var grfArray = new Uint8Array(grfSize)

  // zpl 이미지 포맷에 맞게 압축된 문자열
  var zippedGrf = ''

  // 압축 전 grf 포맷에서 중복되는 문자 수
  var count = 1

  // 비교 기준 문자
  var baseNibble = null

  // 비교 대상 문자
  var objectNibble = null

  // 현재 처리중인 가로 한 줄 문자열
  var currentLine = ''

  // 이전 줄 문자열
  var previousLine = ''

  // 도트 단위 처리를 위해 이미지 크기만큼 루프
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      let j = width * y + x // 현재 도트 좌표 (처리중인 도트)
      let i = j << 2 // 이미지 데이터의 도트 좌표 (도트 * 4)

      // 도트의 밝기
      let luminance = imageData[i + R] * 0.21 + imageData[i + G] * 0.71 + imageData[i + B] * 0.07
      // Alpha 값이 낮을 수록 luminance가 높아지는 것으로 본다.
      luminance = luminance + ((255 - imageData[i + A]) * (255 - luminance)) / 255

      let k = ((bytesPerLine << 3) * y + x) >> 3 // GRF 배열에서 사용할 요소 인덱스
      grfArray[k] <<= 1 // 도트 좌표 이동
      if (luminance < THRESHOLD) grfArray[k] |= 1 // THRESHOLD 값으로 칠할지 여부 판단, 어두우면 칠함

      // 4도트마다 압축 로직 적용 (16진수 문자 하나마다 압축 로직 적용)
      if ((x & 3) == 3) {
        // 현재 처리하는 바이트의 뒷 4자리(16진수 문자 하나)를 비교 대상으로 정한다.
        objectNibble = grfArray[k] & 0b1111

        // 행의 첫 문자는 비교 기준 문자로 정하고 다음 문자로 루프 넘김
        if (x == 3) {
          baseNibble = objectNibble
          continue
        }

        /**
         * 기준 문자와 대상 문자 비교하여 같은 문자가 나오면 count를 올리고
         * 다른 문자가 나오면 기준이었던 문자와 count를 사용해 압축,
         * 가로 줄 문자열에 추가
         */
        if (baseNibble === objectNibble) count++
        else {
          currentLine += compressHexString(baseNibble.toString(16), count)
          count = 1
          baseNibble = objectNibble
        }
      }
    }

    // 끝의 8도트는 남는 도트 수만큼 왼쪽으로 밀어줌
    var lastByteOfLine = grfArray[(y + 1) * bytesPerLine - 1]
    lastByteOfLine <<= diff

    // 니블을 16진수 문자화
    var baseChar = baseNibble.toString(16)

    // 행의 마지막 바이트 압축 처리
    if (diff != 0) {
      // 차이가 4를 넘었을 때 앞 니블이 위의 루프에서 처리되지 않으므로 여기서 함
      if (diff > 4) {
        if (baseNibble == lastByteOfLine >> 4) count++
        else {
          currentLine += compressHexString(baseChar, count)
          count = 1
          baseNibble = lastByteOfLine >> 4
        }
      }
      // 뒷 니블 처리
      if (baseNibble == (lastByteOfLine & 15)) count++
      else {
        currentLine += compressHexString(baseChar, count)
        count = 1
        baseNibble = lastByteOfLine & 15
      }
    }

    // 줄 마지막에 압축된 문자를 더함
    // 이 줄 전부가 같은 문자인지 여부
    var isOverTheLineMax = count >= maxCharsOfLine
    // 이 줄이 모두 0이면 ','로 압축
    if (isOverTheLineMax && baseNibble == 0) currentLine += ','
    // 이 줄이 모두 F이면 '!'로 압축
    else if (isOverTheLineMax && baseNibble == 0xf) currentLine += '!'
    // 아니면 그냥 압축
    else currentLine += compressHexString(baseChar, count)
    count = 1
    // 이전 줄과 현재 줄의 내용이 같으면 ':'로 압축, 아니면 그냥 추가함
    if (currentLine == previousLine) zippedGrf += ':'
    else zippedGrf += currentLine
    // 초기화하고 루프로 돌아감
    previousLine = currentLine
    currentLine = ''
  }
  return zippedGrf
}

// GRF 데이터를 압축
function compressHexString(char, count) {
  const MAP_CODE = {
    1: 'G',
    2: 'H',
    3: 'I',
    4: 'J',
    5: 'K',
    6: 'L',
    7: 'M',
    8: 'N',
    9: 'O',
    10: 'P',
    11: 'Q',
    12: 'R',
    13: 'S',
    14: 'T',
    15: 'U',
    16: 'V',
    17: 'W',
    18: 'X',
    19: 'Y',
    20: 'g',
    40: 'h',
    60: 'i',
    80: 'j',
    100: 'k',
    120: 'l',
    140: 'm',
    160: 'n',
    180: 'o',
    200: 'p',
    220: 'q',
    240: 'r',
    260: 's',
    280: 't',
    300: 'u',
    320: 'v',
    340: 'w',
    360: 'x',
    380: 'y',
    400: 'z'
  }
  var result = ''
  while (count > 420) {
    result += MAP_CODE[400] + char
    count -= 400
  }
  if (count > 20) {
    var multi20 = Math.floor(count / 20) * 20
    var resto20 = count % 20
    result += MAP_CODE[multi20] || null
    if (resto20) result += MAP_CODE[resto20] + char
    else result += char
  } else result += MAP_CODE[count] + char
  return result
}
/**
 * Dawn of War / Relic .fda (Fast Digital Audio) — parser + Relic transform codec decoder.
 * Based on vgmstream's meta/fda.c and coding/libs/relic_lib.c (DCT + mixed-radix FFT).
 */
(function (global) {
  "use strict";

  var RELIC_BUFFER_SIZE = 0x104;
  var RELIC_SAMPLES_PER_FRAME = 512;
  var RELIC_MAX_CHANNELS = 2;
  var RELIC_MAX_SCALES = 6;
  var RELIC_BASE_SCALE = 10.0;
  var RELIC_FREQUENCY_MASKING_FACTOR = 1.0;
  var RELIC_CRITICAL_BAND_COUNT = 27;
  var RELIC_PI = 3.14159265358979323846;
  var RELIC_SIZE_LOW = 128;
  var RELIC_SIZE_MID = 256;
  var RELIC_SIZE_HIGH = 512;
  var RELIC_MAX_SIZE = RELIC_SIZE_HIGH;
  var RELIC_MAX_FREQ = RELIC_MAX_SIZE / 2;
  var RELIC_MAX_FFT = RELIC_MAX_SIZE / 4;
  var RELIC_MIN_BITRATE = 256;
  var RELIC_MAX_BITRATE = 2048;

  var CRITICAL_BAND_DATA = new Int16Array([
    0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 20, 23, 27, 31, 37, 43, 51, 62, 74, 89, 110, 139, 180, 256,
  ]);

  function u32LE(u8, o) {
    return u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24);
  }

  function s32LE(u8, o) {
    var v = u32LE(u8, o);
    return v | 0;
  }

  function readUbits(bits, offset, buf) {
    var shift = offset - 8 * ((offset / 8) | 0);
    var mask = (1 << bits) - 1;
    var pos = (offset / 8) | 0;
    var val = buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24);
    return (val >>> shift) & mask;
  }

  function readSbits(bits, offset, buf) {
    var val = readUbits(bits, offset, buf);
    if ((val >> (bits - 1)) & 1) {
      var mask = (1 << (bits - 1)) - 1;
      return -(val & mask);
    }
    return val | 0;
  }

  /** In-place radix-2 DIT FFT, forward DFT, matches power-of-2 sizes used by Relic (32, 64, 128). */
  function relicMixfftFft(n, xRe, xIm, yRe, yIm) {
    var i;
    for (i = 0; i < n; i++) {
      yRe[i] = xRe[i];
      yIm[i] = xIm[i];
    }
    var j = 0;
    for (i = 0; i < n - 1; i++) {
      if (i < j) {
        var tr = yRe[i];
        yRe[i] = yRe[j];
        yRe[j] = tr;
        var ti = yIm[i];
        yIm[i] = yIm[j];
        yIm[j] = ti;
      }
      var k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1;
      var ang = (-2 * Math.PI) / size;
      for (i = 0; i < n; i += size) {
        for (var k2 = 0; k2 < half; k2++) {
          var c = Math.cos(ang * k2);
          var s = Math.sin(ang * k2);
          var i0 = i + k2;
          var i1 = i0 + half;
          var ar = yRe[i0];
          var ai = yIm[i0];
          var br = yRe[i1];
          var bi = yIm[i1];
          var dr = c * br - s * bi;
          var di = c * bi + s * br;
          yRe[i0] = ar + dr;
          yIm[i0] = ai + di;
          yRe[i1] = ar - dr;
          yIm[i1] = ai - di;
        }
      }
    }
  }

  function initDct(dct, dctSize) {
    var dctQuarter = dctSize >> 2;
    var i;
    for (i = 0; i < dctQuarter; i++) {
      var temp = (i + 0.125) * RELIC_PI * 2 * (1 / dctSize);
      dct[i] = Math.sin(temp);
      dct[dctQuarter + i] = Math.cos(temp);
    }
  }

  function initWindow(window, dctSize) {
    for (var i = 0; i < dctSize; i++) {
      window[i] = Math.sin((i * RELIC_PI) / dctSize);
    }
  }

  function initDequantization(scales) {
    scales[0] = RELIC_BASE_SCALE;
    var i;
    for (i = 1; i < RELIC_MAX_SCALES; i++) {
      scales[i] = scales[i - 1] * scales[0];
    }
    for (i = 0; i < RELIC_MAX_SCALES; i++) {
      scales[i] = (RELIC_FREQUENCY_MASKING_FACTOR / ((1 << (i + 1)) - 1)) * scales[i];
    }
  }

  /** scratchIdct = internal wave_tmp inside apply_idct (RELIC_MAX_SIZE). */
  function applyIdct(freq, waveOut, dct, dctSize, outRe, outIm, tmpRe, tmpIm, scratchIdct) {
    var dctHalf = dctSize >> 1;
    var dctQuarter = dctSize >> 2;
    var dct3quarter = 3 * (dctSize >> 2);
    var i;
    for (i = 0; i < dctQuarter; i++) {
      var coef1 = freq[2 * i] * 0.5;
      var coef2 = freq[dctHalf - 1 - 2 * i] * 0.5;
      tmpRe[i] = coef1 * dct[dctQuarter + i] + coef2 * dct[i];
      tmpIm[i] = -coef1 * dct[i] + coef2 * dct[dctQuarter + i];
    }
    relicMixfftFft(dctQuarter, tmpRe, tmpIm, outRe, outIm);
    var factor = 8 / Math.sqrt(dctSize);
    for (i = 0; i < dctQuarter; i++) {
      var outReI = outRe[i];
      outRe[i] = (outRe[i] * dct[dctQuarter + i] + outIm[i] * dct[i]) * factor;
      outIm[i] = (-outReI * dct[i] + outIm[i] * dct[dctQuarter + i]) * factor;
      scratchIdct[i * 2] = outRe[i];
      scratchIdct[i * 2 + dctHalf] = outIm[i];
    }
    for (i = 1; i < dctSize; i += 2) {
      scratchIdct[i] = -scratchIdct[dctSize - 1 - i];
    }
    for (i = 0; i < dct3quarter; i++) {
      waveOut[i] = scratchIdct[dctQuarter + i];
    }
    for (i = dct3quarter; i < dctSize; i++) {
      waveOut[i] = -scratchIdct[i - dct3quarter];
    }
  }

  /**
   * innerWave = local wave_tmp (first IDCT output). waveTmpArg = optional buffer passed only for
   * decode_frame_base scratch; innerWave is always separate from waveCur.
   */
  function decodeFrame(freq1, freq2, waveCur, wavePrv, dct, window, dctSize, innerWave, outRe, outIm, tmpRe, tmpIm, scratchIdct) {
    var dctHalf = dctSize >> 1;
    var i;
    for (i = 0; i < RELIC_MAX_SIZE; i++) {
      waveCur[i] = wavePrv[i];
    }
    applyIdct(freq1, innerWave, dct, dctSize, outRe, outIm, tmpRe, tmpIm, scratchIdct);
    applyIdct(freq2, wavePrv, dct, dctSize, outRe, outIm, tmpRe, tmpIm, scratchIdct);
    for (i = 0; i < dctHalf; i++) {
      waveCur[dctHalf + i] = innerWave[i] * window[i] + waveCur[dctHalf + i] * window[dctHalf + i];
      wavePrv[i] = wavePrv[i] * window[i] + innerWave[dctHalf + i] * window[dctHalf + i];
    }
  }

  /**
   * innerLocal = first IDCT scratch (never aliased with waveCurOut).
   * tmpStretch = temporary wave_cur for modes that repack into waveCur (MID/LOW etc.).
   */
  function decodeFrameBase(
    freq1,
    freq2,
    waveCur,
    wavePrv,
    dct,
    window,
    dctMode,
    samplesMode,
    innerLocal,
    tmpStretch,
    scratchIdct,
    outRe,
    outIm,
    tmpRe,
    tmpIm
  ) {
    var i;
    if (samplesMode === RELIC_SIZE_LOW) {
      decodeFrame(freq1, freq2, waveCur, wavePrv, dct, window, RELIC_SIZE_LOW, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
    } else if (samplesMode === RELIC_SIZE_MID) {
      if (dctMode === RELIC_SIZE_LOW) {
        decodeFrame(freq1, freq2, tmpStretch, wavePrv, dct, window, RELIC_SIZE_LOW, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
        for (i = 0; i < 256 - 1; i += 2) {
          waveCur[i] = tmpStretch[i >> 1];
          waveCur[i + 1] = tmpStretch[i >> 1];
        }
      } else {
        decodeFrame(freq1, freq2, waveCur, wavePrv, dct, window, RELIC_SIZE_MID, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
      }
    } else if (samplesMode === RELIC_SIZE_HIGH) {
      if (dctMode === RELIC_SIZE_LOW) {
        decodeFrame(freq1, freq2, tmpStretch, wavePrv, dct, window, RELIC_SIZE_LOW, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
        for (i = 0; i < 512 - 1; i += 4) {
          waveCur[i] = tmpStretch[i >> 2];
          waveCur[i + 1] = tmpStretch[i >> 2];
          waveCur[i + 2] = tmpStretch[i >> 2];
          waveCur[i + 3] = tmpStretch[i >> 2];
        }
      } else if (dctMode === RELIC_SIZE_MID) {
        decodeFrame(freq1, freq2, tmpStretch, wavePrv, dct, window, RELIC_SIZE_MID, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
        for (i = 0; i < 512 - 1; i += 2) {
          waveCur[i] = tmpStretch[i >> 1];
          waveCur[i + 1] = tmpStretch[i >> 1];
        }
      } else {
        decodeFrame(freq1, freq2, waveCur, wavePrv, dct, window, RELIC_SIZE_HIGH, innerLocal, outRe, outIm, tmpRe, tmpIm, scratchIdct);
      }
    }
  }

  function unpackFrame(buf, bufSize, freq1, freq2, scales, exponents, freqSize) {
    var flags = readUbits(2, 0, buf);
    var cbBits = readUbits(3, 2, buf);
    var evBits = readUbits(2, 5, buf);
    var eiBits = readUbits(4, 7, buf);
    var bitOffset = 11;
    var maxOffset = bufSize * 8;
    var freqHalf = freqSize >> 1;
    var i;
    var j;
    var pos;
    var move;
    var ev;
    var qv;
    var qvBits;

    for (i = 0; i < RELIC_MAX_FREQ; i++) {
      freq1[i] = 0;
      freq2[i] = 0;
    }

    if (flags & 1) {
      for (i = 0; i < RELIC_MAX_FREQ; i++) exponents[i] = 0;
    }

    if (cbBits > 0 && evBits > 0) {
      pos = 0;
      for (i = 0; i < RELIC_CRITICAL_BAND_COUNT - 1; i++) {
        if (bitOffset + cbBits > maxOffset) return false;
        move = readUbits(cbBits, bitOffset, buf);
        bitOffset += cbBits;
        if (i > 0 && move === 0) break;
        pos += move;
        if (bitOffset + evBits > maxOffset) return false;
        ev = readUbits(evBits, bitOffset, buf);
        bitOffset += evBits;
        if (pos + 1 >= RELIC_CRITICAL_BAND_COUNT) return false;
        for (j = CRITICAL_BAND_DATA[pos]; j < CRITICAL_BAND_DATA[pos + 1]; j++) {
          exponents[j] = ev;
        }
      }
    }

    if (freqHalf > 0 && eiBits > 0) {
      pos = 0;
      for (i = 0; i < RELIC_MAX_FREQ; i++) {
        if (bitOffset + eiBits > maxOffset) return false;
        move = readUbits(eiBits, bitOffset, buf);
        bitOffset += eiBits;
        if (i > 0 && move === 0) break;
        pos += move;
        if (pos >= RELIC_MAX_FREQ) return false;
        qvBits = exponents[pos];
        if (bitOffset + qvBits + 2 > maxOffset) return false;
        qv = readSbits(qvBits + 2, bitOffset, buf);
        bitOffset += qvBits + 2;
        if (qv !== 0 && pos < freqHalf && qvBits < 6) {
          freq1[pos] = qv * scales[qvBits];
        }
      }
      if (flags & 2) {
        for (i = 0; i < RELIC_MAX_FREQ; i++) freq2[i] = freq1[i];
      } else {
        pos = 0;
        for (i = 0; i < RELIC_MAX_FREQ; i++) {
          if (bitOffset + eiBits > maxOffset) return false;
          move = readUbits(eiBits, bitOffset, buf);
          bitOffset += eiBits;
          if (i > 0 && move === 0) break;
          pos += move;
          if (pos >= RELIC_MAX_FREQ) return false;
          qvBits = exponents[pos];
          if (bitOffset + qvBits + 2 > maxOffset) return false;
          qv = readSbits(qvBits + 2, bitOffset, buf);
          bitOffset += qvBits + 2;
          if (qv !== 0 && pos < freqHalf && qvBits < 6) {
            freq2[pos] = qv * scales[qvBits];
          }
        }
      }
    }
    return true;
  }

  function clamp16(v) {
    if (v > 32767) return 32767;
    if (v < -32768) return -32768;
    return v | 0;
  }

  function relicBytesToSamples(bytes, channels, bitrate) {
    var frameSize = bitrate / 8;
    return ((bytes / channels / frameSize) | 0) * RELIC_SAMPLES_PER_FRAME;
  }

  function parseFdaHeader(u8) {
    if (u8.length < 0x80) return { ok: false, error: "File too small" };
    var magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3], u8[4], u8[5], u8[6], u8[7]);
    if (magic !== "Relic Ch") return { ok: false, error: "Not a Relic Chunky file" };
    if (u8[8] !== 0x75 || u8[9] !== 0x6e || u8[10] !== 0x6b || u8[11] !== 0x79 || u8[12] !== 0x0d || u8[13] !== 0x0a || u8[14] !== 0x1a || u8[15] !== 0x00) {
      return { ok: false, error: "Invalid Chunky trailer" };
    }
    if (u32LE(u8, 0x10) !== 1 || u32LE(u8, 0x14) !== 1) return { ok: false, error: "Unsupported FDA version" };

    var offset = 0x18;
    var chunkSize = u32LE(u8, offset + 0x0c);
    var nameSize = u32LE(u8, offset + 0x10);
    offset += 0x14 + nameSize + chunkSize;

    if (String.fromCharCode(u8[offset + 4], u8[offset + 5], u8[offset + 6], u8[offset + 7]) !== "FDA ") {
      return { ok: false, error: "Missing FOLD-FDA" };
    }
    offset += 0x14;

    if (String.fromCharCode(u8[offset + 4], u8[offset + 5], u8[offset + 6], u8[offset + 7]) !== "INFO") {
      return { ok: false, error: "Missing DATA-INFO" };
    }
    chunkSize = u32LE(u8, offset + 0x0c);
    nameSize = u32LE(u8, offset + 0x10);
    offset += 0x14 + nameSize;

    var channels = s32LE(u8, offset + 0x00);
    var bitrate = s32LE(u8, offset + 0x08);
    var sampleRate = s32LE(u8, offset + 0x0c);
    offset += chunkSize;

    if (String.fromCharCode(u8[offset + 4], u8[offset + 5], u8[offset + 6], u8[offset + 7]) !== "DATA") {
      return { ok: false, error: "Missing DATA-DATA" };
    }
    chunkSize = u32LE(u8, offset + 0x0c);
    nameSize = u32LE(u8, offset + 0x10);
    offset += 0x14 + nameSize;

    var dataSize = u32LE(u8, offset + 0x00);
    var startOffset = offset + 4;

    if (channels < 1 || channels > RELIC_MAX_CHANNELS) return { ok: false, error: "Bad channel count" };
    if (bitrate < RELIC_MIN_BITRATE || bitrate > RELIC_MAX_BITRATE) return { ok: false, error: "Bad bitrate" };
    if (startOffset + dataSize > u8.length) return { ok: false, error: "Truncated audio data" };

    var numSamples = relicBytesToSamples(dataSize, channels, bitrate);

    return {
      ok: true,
      channels: channels,
      bitrate: bitrate,
      sampleRate: sampleRate,
      dataOffset: startOffset,
      dataSize: dataSize,
      numSamples: numSamples,
    };
  }

  function decodeFdaToPcm16(u8) {
    var meta = parseFdaHeader(u8);
    if (!meta.ok) return meta;

    var channels = meta.channels;
    var bitrate = meta.bitrate;
    var sampleRate = meta.sampleRate;
    var frameSize = bitrate / 8;
    var data = u8.subarray(meta.dataOffset, meta.dataOffset + meta.dataSize);

    var freqSize;
    if (sampleRate < 22050) freqSize = RELIC_SIZE_LOW;
    else if (sampleRate === 22050) freqSize = RELIC_SIZE_MID;
    else freqSize = RELIC_SIZE_HIGH;

    var dct = new Float32Array(RELIC_MAX_SIZE);
    var window = new Float32Array(RELIC_MAX_SIZE);
    var scales = new Float32Array(RELIC_MAX_SCALES);
    initDct(dct, RELIC_SIZE_HIGH);
    initWindow(window, RELIC_SIZE_HIGH);
    initDequantization(scales);

    var exponents = new Uint8Array(RELIC_MAX_CHANNELS * RELIC_MAX_FREQ);
    var freq1 = new Float32Array(RELIC_MAX_FREQ);
    var freq2 = new Float32Array(RELIC_MAX_FREQ);
    var waveCur = [new Float32Array(RELIC_MAX_SIZE), new Float32Array(RELIC_MAX_SIZE)];
    var wavePrv = [new Float32Array(RELIC_MAX_SIZE), new Float32Array(RELIC_MAX_SIZE)];
    var innerLocal = new Float32Array(RELIC_MAX_SIZE);
    var tmpStretch = new Float32Array(RELIC_MAX_SIZE);
    var scratchIdct = new Float32Array(RELIC_MAX_SIZE);
    var outRe = new Float32Array(RELIC_MAX_FFT);
    var outIm = new Float32Array(RELIC_MAX_FFT);
    var tmpRe = new Float32Array(RELIC_MAX_FFT);
    var tmpIm = new Float32Array(RELIC_MAX_FFT);

    var dctMode = RELIC_SIZE_HIGH;
    var samplesMode = RELIC_SIZE_HIGH;

    var totalFrames = ((data.length / (frameSize * channels)) | 0);
    var pcm = new Int16Array(totalFrames * RELIC_SAMPLES_PER_FRAME * channels);
    var pcmOff = 0;
    var buf = new Uint8Array(RELIC_BUFFER_SIZE);
    var ch;
    var f;
    var s;

    for (f = 0; f < totalFrames; f++) {
      for (ch = 0; ch < channels; ch++) {
        var srcOff = f * frameSize * channels + ch * frameSize;
        buf.fill(0);
        buf.set(data.subarray(srcOff, srcOff + frameSize));
        var exp = new Uint8Array(exponents.buffer, ch * RELIC_MAX_FREQ, RELIC_MAX_FREQ);
        if (!unpackFrame(buf, RELIC_BUFFER_SIZE, freq1, freq2, scales, exp, freqSize)) {
          return { ok: false, error: "Frame unpack failed at " + f };
        }
        decodeFrameBase(
          freq1,
          freq2,
          waveCur[ch],
          wavePrv[ch],
          dct,
          window,
          dctMode,
          samplesMode,
          innerLocal,
          tmpStretch,
          scratchIdct,
          outRe,
          outIm,
          tmpRe,
          tmpIm
        );
      }
      for (s = 0; s < RELIC_SAMPLES_PER_FRAME; s++) {
        for (ch = 0; ch < channels; ch++) {
          pcm[pcmOff++] = clamp16(waveCur[ch][s]);
        }
      }
    }

    return {
      ok: true,
      pcm16: pcm,
      sampleRate: sampleRate,
      channels: channels,
      numSamples: pcm.length / channels,
    };
  }

  function pcm16ToWav(pcm16, channels, sampleRate) {
    var numSamples = pcm16.length / channels;
    var dataSize = pcm16.length * 2;
    var buf = new ArrayBuffer(44 + dataSize);
    var v = new DataView(buf);
    var o = 0;
    function w32(n) {
      v.setUint32(o, n, true);
      o += 4;
    }
    function w16(n) {
      v.setUint16(o, n, true);
      o += 2;
    }
    v.setUint8(o++, 0x52);
    v.setUint8(o++, 0x49);
    v.setUint8(o++, 0x46);
    v.setUint8(o++, 0x46);
    w32(36 + dataSize);
    v.setUint8(o++, 0x57);
    v.setUint8(o++, 0x41);
    v.setUint8(o++, 0x56);
    v.setUint8(o++, 0x45);
    v.setUint8(o++, 0x66);
    v.setUint8(o++, 0x6d);
    v.setUint8(o++, 0x74);
    v.setUint8(o++, 0x20);
    w32(16);
    w16(1);
    w16(channels);
    w32(sampleRate);
    w32(sampleRate * channels * 2);
    w16(channels * 2);
    w16(16);
    v.setUint8(o++, 0x64);
    v.setUint8(o++, 0x61);
    v.setUint8(o++, 0x74);
    v.setUint8(o++, 0x61);
    w32(dataSize);
    for (var i = 0; i < pcm16.length; i++) {
      v.setInt16(o, pcm16[i], true);
      o += 2;
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  function decodeToWav(u8) {
    var r = decodeFdaToPcm16(u8);
    if (!r.ok) return r;
    var blob = pcm16ToWav(r.pcm16, r.channels, r.sampleRate);
    var durMs = (r.numSamples / r.sampleRate) * 1000;
    return { ok: true, blob: blob, durationMs: durMs, sampleRate: r.sampleRate, channels: r.channels };
  }

  global.FDA = {
    decodeToWav: decodeToWav,
    decodeFdaToPcm16: decodeFdaToPcm16,
    parseFdaHeader: parseFdaHeader,
  };
})(typeof window !== "undefined" ? window : globalThis);

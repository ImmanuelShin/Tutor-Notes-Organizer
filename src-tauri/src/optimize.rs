use std::io::Cursor;

use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, imageops::FilterType};
use lopdf::{Dictionary, Document, Object, Stream};
use sha2::{Digest, Sha256};

pub const MAX_LONG_EDGE: u32 = 1600;
pub const PHOTO_QUALITY: u8 = 75;
pub const PDF_JPEG_QUALITY: u8 = 72;
pub const KEEP_BYTES: u64 = 400 * 1024;

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex::encode(digest)
}

pub fn decode_image(bytes: &[u8]) -> Result<DynamicImage, String> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())
}

fn resize_to_max_edge(img: DynamicImage, max_edge: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    let long = w.max(h);
    if long <= max_edge {
        return img;
    }
    let scale = max_edge as f32 / long as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    img.resize(nw, nh, FilterType::Triangle)
}

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let mut buf = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    encoder.encode_image(&rgb).map_err(|e| e.to_string())?;
    Ok(buf)
}

fn guessed_format(bytes: &[u8], fallback: ImageFormat) -> ImageFormat {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()
        .and_then(|r| r.format())
        .unwrap_or(fallback)
}

/// Recompress a photo/screenshot. Returns (bytes, extension without dot).
pub fn optimize_image_bytes(bytes: &[u8], hinted_ext: &str) -> Result<(Vec<u8>, String), String> {
    let format = guessed_format(
        bytes,
        match hinted_ext {
            "jpg" | "jpeg" => ImageFormat::Jpeg,
            "gif" => ImageFormat::Gif,
            "webp" => ImageFormat::WebP,
            "bmp" => ImageFormat::Bmp,
            "tif" | "tiff" => ImageFormat::Tiff,
            _ => ImageFormat::Png,
        },
    );

    let keep_ext = match format {
        ImageFormat::Jpeg => "jpg",
        ImageFormat::Png => "png",
        ImageFormat::Gif => "gif",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Tiff => "tiff",
        _ => hinted_ext,
    };

    let img = match decode_image(bytes) {
        Ok(img) => img,
        Err(_) => return Ok((bytes.to_vec(), keep_ext.to_string())),
    };
    let (w, h) = img.dimensions();
    let too_big = w.max(h) > MAX_LONG_EDGE || bytes.len() as u64 > KEEP_BYTES;
    let preserve = matches!(format, ImageFormat::Gif | ImageFormat::Png | ImageFormat::WebP)
        && !too_big;

    if !too_big || preserve {
        return Ok((bytes.to_vec(), keep_ext.to_string()));
    }

    let resized = resize_to_max_edge(img, MAX_LONG_EDGE);
    match encode_jpeg(&resized, PHOTO_QUALITY) {
        Ok(jpeg) if jpeg.len() < bytes.len() => Ok((jpeg, "jpg".into())),
        Ok(jpeg) if too_big && w.max(h) > MAX_LONG_EDGE => Ok((jpeg, "jpg".into())),
        _ => Ok((bytes.to_vec(), keep_ext.to_string())),
    }
}

fn is_dct_only(dict: &Dictionary) -> bool {
    match dict.get(b"Filter") {
        Ok(Object::Name(n)) => n.as_slice() == b"DCTDecode",
        Ok(Object::Array(arr)) => {
            arr.len() == 1
                && matches!(
                    arr.first(),
                    Some(Object::Name(n)) if n.as_slice() == b"DCTDecode"
                )
        }
        _ => false,
    }
}

fn jpeg_content(stream: &Stream) -> Vec<u8> {
    stream
        .decompressed_content()
        .unwrap_or_else(|_| stream.content.clone())
}

fn recompress_pdf_jpeg(jpeg: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    let img = decode_image(jpeg).ok()?;
    let (w, h) = img.dimensions();
    let too_big = w.max(h) > MAX_LONG_EDGE || jpeg.len() as u64 > 200 * 1024;
    if !too_big {
        return None;
    }
    let resized = resize_to_max_edge(img, MAX_LONG_EDGE);
    let (nw, nh) = resized.dimensions();
    let encoded = encode_jpeg(&resized, PDF_JPEG_QUALITY).ok()?;
    if encoded.len() >= jpeg.len() {
        return None;
    }
    Some((encoded, nw, nh))
}

pub fn optimize_pdf_bytes(bytes: &[u8]) -> Vec<u8> {
    let mut doc = match Document::load_mem(bytes) {
        Ok(doc) => doc,
        Err(_) => return bytes.to_vec(),
    };

    let ids: Vec<_> = doc.objects.keys().copied().collect();
    let mut changed = false;
    for id in ids {
        let dct = match doc.get_object(id) {
            Ok(Object::Stream(stream)) => is_dct_only(&stream.dict),
            _ => false,
        };
        if !dct {
            continue;
        }
        let jpeg = match doc.get_object(id) {
            Ok(Object::Stream(stream)) => jpeg_content(stream),
            _ => continue,
        };
        let Some((new_jpeg, width, height)) = recompress_pdf_jpeg(&jpeg) else {
            continue;
        };
        let Ok(Object::Stream(stream)) = doc.get_object_mut(id) else {
            continue;
        };
        stream.set_content(new_jpeg.clone());
        stream.allows_compression = false;
        stream.dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));
        stream.dict.set("Length", Object::Integer(new_jpeg.len() as i64));
        stream.dict.set("Width", Object::Integer(width as i64));
        stream.dict.set("Height", Object::Integer(height as i64));
        stream.dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
        stream.dict.set("BitsPerComponent", Object::Integer(8));
        changed = true;
    }

    if !changed {
        return bytes.to_vec();
    }

    let mut out = Vec::new();
    if doc.save_to(&mut out).is_err() || out.len() >= bytes.len() || out.is_empty() {
        return bytes.to_vec();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn sha256_hex_length() {
        assert_eq!(sha256_hex(b"abc").len(), 64);
    }

    #[test]
    fn geometry_scan_pdf_shrinks_when_present() {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return;
        };
        let path = PathBuf::from(appdata)
            .join("com.tutornotes.organizer")
            .join("pdfs")
            .join("Geometry Lesson 10.pdf");
        if !path.exists() {
            return;
        }
        let bytes = std::fs::read(&path).expect("read pdf");
        let out = optimize_pdf_bytes(&bytes);
        eprintln!(
            "Geometry Lesson 10.pdf {} KB -> {} KB",
            bytes.len() / 1024,
            out.len() / 1024
        );
        assert!(
            out.len() < bytes.len(),
            "expected shrink {} -> {}",
            bytes.len(),
            out.len()
        );
    }
}

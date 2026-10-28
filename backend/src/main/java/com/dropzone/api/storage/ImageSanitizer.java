package com.dropzone.api.storage;

import com.dropzone.api.common.ApiException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

public final class ImageSanitizer {

	public static final int MAX_SIDE = 4096;
	static final float JPEG_QUALITY = 0.9f;

	private ImageSanitizer() {
	}

	public record Image(byte[] data, String extension, String contentType, int width, int height) {
	}

	public static Image sanitize(byte[] data) {
		String extension = imageExtension(data);
		if (extension == null) {
			throw ApiException.validation("Only JPEG or PNG images are allowed");
		}
		BufferedImage image = decode(data);
		try {
			if (extension.equals("png")) {
				return new Image(writePng(image), "png", "image/png", image.getWidth(), image.getHeight());
			}
			BufferedImage oriented = orient(image, exifOrientation(data));
			return new Image(writeJpeg(oriented), "jpg", "image/jpeg", oriented.getWidth(), oriented.getHeight());
		}
		catch (IOException | RuntimeException e) {
			throw unreadable();
		}
	}

	public static byte[] shrink(byte[] data, int maxSide) {
		BufferedImage image = decode(data);
		double scale = Math.min(1.0, (double) maxSide / Math.max(image.getWidth(), image.getHeight()));
		int width = Math.max(1, (int) Math.round(image.getWidth() * scale));
		int height = Math.max(1, (int) Math.round(image.getHeight() * scale));
		BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = target.createGraphics();
		try {
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
			g.setColor(Color.WHITE);
			g.fillRect(0, 0, width, height);
			g.drawImage(image, 0, 0, width, height, null);
		}
		finally {
			g.dispose();
		}
		try {
			return writeJpeg(target);
		}
		catch (IOException e) {
			throw unreadable();
		}
	}

	static String imageExtension(byte[] data) {
		if (data.length >= 3 && (data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xD8 && (data[2] & 0xFF) == 0xFF) {
			return "jpg";
		}
		if (data.length >= 8 && (data[0] & 0xFF) == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G') {
			return "png";
		}
		return null;
	}

	private static BufferedImage decode(byte[] data) {
		try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
			Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
			if (!readers.hasNext()) {
				throw unreadable();
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(in, true, true);
				int width = reader.getWidth(0);
				int height = reader.getHeight(0);
				if (width > MAX_SIDE || height > MAX_SIDE) {
					throw ApiException.validation("Image is too large (max " + MAX_SIDE + " px per side)");
				}
				return reader.read(0);
			}
			finally {
				reader.dispose();
			}
		}
		catch (ApiException e) {
			throw e;
		}
		catch (IOException | RuntimeException e) {
			throw unreadable();
		}
	}

	private static byte[] writePng(BufferedImage image) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		if (!ImageIO.write(image, "png", out)) {
			throw new IOException("No PNG writer");
		}
		return out.toByteArray();
	}

	private static byte[] writeJpeg(BufferedImage image) throws IOException {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		ImageWriteParam param = writer.getDefaultWriteParam();
		param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
		param.setCompressionQuality(JPEG_QUALITY);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
			writer.setOutput(stream);
			writer.write(null, new IIOImage(image, null, null), param);
		}
		finally {
			writer.dispose();
		}
		return out.toByteArray();
	}

	private static BufferedImage orient(BufferedImage image, int orientation) {
		int w = image.getWidth();
		int h = image.getHeight();
		boolean plainRgb = image.getType() == BufferedImage.TYPE_3BYTE_BGR || image.getType() == BufferedImage.TYPE_INT_RGB
				|| image.getType() == BufferedImage.TYPE_BYTE_GRAY;
		if (orientation == 1 && plainRgb) {
			return image;
		}
		AffineTransform transform = switch (orientation) {
			case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
			case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
			case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
			case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
			case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
			case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
			case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);
			default -> new AffineTransform();
		};
		boolean swap = orientation >= 5 && orientation <= 8;
		BufferedImage target = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = target.createGraphics();
		try {
			g.setColor(Color.WHITE);
			g.fillRect(0, 0, target.getWidth(), target.getHeight());
			g.drawImage(image, transform, null);
		}
		finally {
			g.dispose();
		}
		return target;
	}

	static int exifOrientation(byte[] d) {
		int i = 2;
		while (i + 4 <= d.length) {
			if ((d[i] & 0xFF) != 0xFF) {
				return 1;
			}
			int marker = d[i + 1] & 0xFF;
			if (marker == 0xFF) {
				i++;
				continue;
			}
			if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
				i += 2;
				continue;
			}
			if (marker == 0xDA || marker == 0xD9) {
				return 1;
			}
			int length = ((d[i + 2] & 0xFF) << 8) | (d[i + 3] & 0xFF);
			if (length < 2) {
				return 1;
			}
			int end = Math.min(d.length, i + 2 + length);
			if (marker == 0xE1 && i + 10 <= end && d[i + 4] == 'E' && d[i + 5] == 'x' && d[i + 6] == 'i' && d[i + 7] == 'f'
					&& d[i + 8] == 0 && d[i + 9] == 0) {
				return tiffOrientation(d, i + 10, end);
			}
			i += 2 + length;
		}
		return 1;
	}

	private static int tiffOrientation(byte[] d, int start, int end) {
		if (start + 8 > end) {
			return 1;
		}
		boolean little;
		if (d[start] == 'I' && d[start + 1] == 'I') {
			little = true;
		}
		else if (d[start] == 'M' && d[start + 1] == 'M') {
			little = false;
		}
		else {
			return 1;
		}
		long offset = u32(d, start + 4, little);
		if (offset < 8 || offset > end - start - 2) {
			return 1;
		}
		int ifd = start + (int) offset;
		int count = u16(d, ifd, little);
		for (int k = 0; k < count; k++) {
			int entry = ifd + 2 + k * 12;
			if (entry + 12 > end) {
				return 1;
			}
			if (u16(d, entry, little) == 0x0112) {
				int value = u16(d, entry + 8, little);
				return value >= 1 && value <= 8 ? value : 1;
			}
		}
		return 1;
	}

	private static int u16(byte[] d, int i, boolean little) {
		int a = d[i] & 0xFF;
		int b = d[i + 1] & 0xFF;
		return little ? (b << 8) | a : (a << 8) | b;
	}

	private static long u32(byte[] d, int i, boolean little) {
		long a = d[i] & 0xFF;
		long b = d[i + 1] & 0xFF;
		long c = d[i + 2] & 0xFF;
		long e = d[i + 3] & 0xFF;
		return little ? (e << 24) | (c << 16) | (b << 8) | a : (a << 24) | (b << 16) | (c << 8) | e;
	}

	private static ApiException unreadable() {
		return ApiException.validation("Could not read the image. Use a JPEG or PNG photo.");
	}
}

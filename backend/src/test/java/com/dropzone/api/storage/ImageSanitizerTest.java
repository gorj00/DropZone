package com.dropzone.api.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.common.ApiException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageSanitizerTest {

	private static BufferedImage halves(int width, int height) {
		BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = image.createGraphics();
		g.setColor(Color.RED);
		g.fillRect(0, 0, width / 2, height);
		g.setColor(Color.BLUE);
		g.fillRect(width / 2, 0, width - width / 2, height);
		g.dispose();
		return image;
	}

	private static byte[] encode(BufferedImage image, String format) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, format, out);
		return out.toByteArray();
	}

	private static byte[] withExif(byte[] jpeg, int orientation) throws IOException {
		ByteArrayOutputStream tiff = new ByteArrayOutputStream();
		tiff.write(new byte[] { 'M', 'M', 0, 0x2A, 0, 0, 0, 8 });
		tiff.write(ByteBuffer.allocate(2).putShort((short) 2).array());
		tiff.write(ByteBuffer.allocate(12).putShort((short) 0x0112).putShort((short) 3).putInt(1).putShort((short) orientation)
				.putShort((short) 0).array());
		tiff.write(ByteBuffer.allocate(12).putShort((short) 0x8825).putShort((short) 4).putInt(1).putInt(38).array());
		tiff.write(new byte[] { 0, 0, 0, 0 });
		tiff.write("GPS-49.1951N-16.6068E".getBytes(StandardCharsets.US_ASCII));
		byte[] payload = tiff.toByteArray();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(jpeg, 0, 2);
		out.write(new byte[] { (byte) 0xFF, (byte) 0xE1 });
		out.write(ByteBuffer.allocate(2).putShort((short) (2 + 6 + payload.length)).array());
		out.write(new byte[] { 'E', 'x', 'i', 'f', 0, 0 });
		out.write(payload);
		out.write(jpeg, 2, jpeg.length - 2);
		return out.toByteArray();
	}

	private static byte[] withTextChunk(byte[] png, String text) throws IOException {
		int iend = png.length - 12;
		byte[] type = "tEXt".getBytes(StandardCharsets.US_ASCII);
		byte[] data = ("Comment\0" + text).getBytes(StandardCharsets.ISO_8859_1);
		CRC32 crc = new CRC32();
		crc.update(type);
		crc.update(data);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(png, 0, iend);
		out.write(ByteBuffer.allocate(4).putInt(data.length).array());
		out.write(type);
		out.write(data);
		out.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
		out.write(png, iend, 12);
		return out.toByteArray();
	}

	private static boolean contains(byte[] data, String text) {
		return new String(data, StandardCharsets.ISO_8859_1).contains(text);
	}

	@Test
	void jpegLosesExifAndIsTurnedUpright() throws IOException {
		byte[] original = withExif(encode(halves(20, 10), "jpg"), 6);
		assertThat(ImageSanitizer.exifOrientation(original)).isEqualTo(6);
		assertThat(contains(original, "GPS-49.1951N")).isTrue();

		ImageSanitizer.Image clean = ImageSanitizer.sanitize(original);

		assertThat(clean.contentType()).isEqualTo("image/jpeg");
		assertThat(clean.extension()).isEqualTo("jpg");
		assertThat(contains(clean.data(), "Exif")).isFalse();
		assertThat(contains(clean.data(), "GPS-49.1951N")).isFalse();
		BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(clean.data()));
		assertThat(decoded.getWidth()).isEqualTo(10);
		assertThat(decoded.getHeight()).isEqualTo(20);
		assertThat(new Color(decoded.getRGB(5, 2)).getRed()).isGreaterThan(200);
		assertThat(new Color(decoded.getRGB(5, 17)).getBlue()).isGreaterThan(200);
	}

	@Test
	void pngLosesTextChunks() throws IOException {
		byte[] original = withTextChunk(encode(halves(8, 8), "png"), "home-address");
		assertThat(contains(original, "home-address")).isTrue();
		ImageSanitizer.Image clean = ImageSanitizer.sanitize(original);
		assertThat(clean.contentType()).isEqualTo("image/png");
		assertThat(contains(clean.data(), "home-address")).isFalse();
		assertThat(ImageIO.read(new ByteArrayInputStream(clean.data())).getWidth()).isEqualTo(8);
	}

	@Test
	void rejectsNonImagesBrokenImagesAndHugeImages() throws IOException {
		assertThatThrownBy(() -> ImageSanitizer.sanitize("hello".getBytes())).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> ImageSanitizer.sanitize(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 1, 2 }))
				.isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> ImageSanitizer.sanitize(encode(new BufferedImage(4097, 2, BufferedImage.TYPE_INT_RGB), "png")))
				.isInstanceOf(ApiException.class).hasMessageContaining("4096");
	}
}

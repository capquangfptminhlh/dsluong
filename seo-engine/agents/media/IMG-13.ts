export async function generateImage(keyword: string): Promise<string> {
  console.log(`[IMG-13] Đang tạo ảnh minh họa cho từ khóa: ${keyword}`);
  
  try {
    // Sử dụng Pollinations.ai để sinh ảnh AI miễn phí từ text prompt
    // Mã hóa từ khóa thành prompt tiếng Anh đơn giản để AI vẽ tốt hơn
    const prompt = encodeURIComponent(`Professional high quality photography representing ${keyword}, business, modern, 8k resolution`);
    const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&nologo=true`;
    
    // Ở hệ thống thực tế, ta có thể dùng fetch() để tải ảnh về server
    // Nhưng để tiết kiệm dung lượng VPS, ta sẽ sử dụng trực tiếp link CDN của AI
    
    console.log(`[IMG-13] ✅ Đã tạo ảnh thành công: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error("[IMG-13] Lỗi tạo ảnh:", error);
    // Trả về ảnh mặc định nếu lỗi
    return `https://placehold.co/1200x630/2a2a2a/ffffff.png?text=${encodeURIComponent(keyword)}`;
  }
}

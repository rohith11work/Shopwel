import os
import qrcode
from PIL import Image

def generate_qr():
    # URL to encode
    url = "https://shopwel.onrender.com/"
    
    # Setup QR code parameters
    # High error correction (Q or H) allows for logo overlay or minor physical damage to the sticker
    qr = qrcode.QRCode(
        version=None,  # automatically size
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Create the QR code image
    # Style it with brand-appropriate colors: deep green (#145c2d) or standard black
    # For maximum scannability on all devices, we'll use black/white, but make the resolution high.
    qr_img = qr.make_image(fill_color="#145c2d", back_color="white")
    
    # Ensure images directory exists
    os.makedirs("images", exist_ok=True)
    
    # Save the QR code image
    output_path = "images/qr_code.png"
    qr_img.save(output_path)
    print(f"✅ QR Code generated successfully at {output_path}")

if __name__ == "__main__":
    generate_qr()

import UIKit
import Capacitor

class CustomViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Force dark background behind safe-area insets so no white gap appears
        let darkColor = UIColor(red: 13/255, green: 27/255, blue: 42/255, alpha: 1) // #0D1B2A
        view.backgroundColor = darkColor
        webView?.backgroundColor = darkColor
        webView?.isOpaque = false
        webView?.scrollView.backgroundColor = darkColor

        // Disable rubber-band bounce on the main scrollView
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
    }
}

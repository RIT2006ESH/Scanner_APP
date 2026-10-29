package com.scanner_app

import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // FLAG_SECURE: the screen shows blank in the Recents list, and screenshots
    // and screen recording are blocked. Comment this line out only when you
    // need dev screenshots, and put it back afterwards.
    window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(savedInstanceState)
  }

  override fun getMainComponentName(): String = "Scanner_app"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}

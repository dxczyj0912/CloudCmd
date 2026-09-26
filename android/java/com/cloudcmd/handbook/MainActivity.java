package com.cloudcmd.handbook;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * CloudCmd · 云计算命令手册 —— Android 外壳。
 *
 * <p>整个网站打包在 {@code assets/www/} 里，用 WebView 加载 {@code file:///android_asset/www/index.html}。
 * 因此它**天然离线可用**，也**不需要任何权限**（连 INTERNET 都没有）：
 * 站内命令、课程、卡片与模拟终端全部是本地文件；
 * 官方文档外链交给系统浏览器打开。
 *
 * <p>这个类只做四件事，其余全部交给网页：
 * <ol>
 *   <li>把 WebView 配好（localStorage、viewport、不禁缩放以外的默认行为）</li>
 *   <li>http(s) 外链交给系统浏览器，站内 file:// 链接留在 WebView 里</li>
 *   <li>返回键先走网页历史（站内是 hash 路由），到顶了再按一次才退出</li>
 *   <li>旋转/切主题时不重建 Activity（configChanges 已经在清单里声明）</li>
 * </ol>
 */
public class MainActivity extends Activity {

    /** 站内首页。站点的 hash 路由在这里继续工作。 */
    private static final String START_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private long lastBackAt = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* 状态栏用站点的主色，视觉上连成一块；网页那边用 env(safe-area-inset-*) 兜底留白。
           刻意**不**做 edge-to-edge：WebView 对 safe-area 环境变量的支持在 Android 上并不一致，
           保持系统栏占位反而更稳。 */
        try {
            getWindow().setStatusBarColor(Color.parseColor("#2F6BFF"));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getWindow().setNavigationBarColor(Color.WHITE);
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        } catch (Throwable ignored) {
            /* 状态栏配色失败不该影响启动 */
        }

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.WHITE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(web);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        /* localStorage 必须开：学习进度、收藏、"已掌握"、每日一练的间隔重复全存在这里 */
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        /* 让网页自己的 <meta name="viewport"> 生效，否则手机上会按桌面宽度渲染 */
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        /* 页面里已经有触摸友好的字号与布局，这里不要再叠加缩放 */
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        /* 尊重系统文字大小；网页的响应式布局负责处理较大的文字。 */

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternally(request.getUrl() == null ? null : request.getUrl().toString());
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    /**
     * 站内链接（file://）留在 WebView 里；其余一律交给系统浏览器。
     *
     * <p>这样做有一个直接好处：**本应用不需要 INTERNET 权限**。
     * 官方文档链接能不能打开取决于手机上装了什么浏览器，而不是这个学习工具要不要联网。
     *
     * @return true 表示"已经由我们处理掉了"，WebView 不要自己加载
     */
    private boolean openExternally(String url) {
        if (url == null) return false;
        if (url.startsWith("file://")) return false;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable t) {
            Toast.makeText(this, "没有能打开这个链接的应用", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    /**
     * 返回键：站内是 hash 路由，所以先退网页历史；退到顶了再按一次才退出应用。
     * "再按一次退出" 是 Android 上最不容易误触的做法。
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web != null && web.canGoBack()) {
                web.goBack();
            } else {
                long now = System.currentTimeMillis();
                if (now - lastBackAt < 2000L) {
                    finish();
                } else {
                    lastBackAt = now;
                    Toast.makeText(this, "再按一次返回退出", Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

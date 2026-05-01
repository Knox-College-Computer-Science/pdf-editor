import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class website {
    public static void web (String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/", new website.HelloHandler());

        // 2. NEW: This tells the server how to handle the request for your JS files
        server.createContext("/JS/pdfview.js", new website.JSHandler());
        server.createContext("/JS/Tool.js", new website.JSHandler());
        server.createContext("/JS/Undo.js", new website.JSHandler());
        server.createContext("/JS/Sidebar.js", new website.JSHandler());

        // server.createContext("/pdf.js", new PDFLibHandler());
        // If your pdfview.js is looking for "sample.pdf"
        server.createContext("/pdf.pdf", new PDFFileHandler());
        
        // NEW: Handle CSS files
        server.createContext("/css/style.css", new website.CSSHandler());

        // server.createContext("/fabric.js", new website.FabricHandler());

        server.createContext("/upload", new website.UploadHandler());

        server.setExecutor(null);

        server.start();
        System.out.println("server staterd MF!!!!");

    }
    static class HelloHandler implements HttpHandler{

        @Override
        public void handle(HttpExchange exchange) throws IOException{
            String path = exchange.getRequestURI().getPath();

            
            if ("/JS/pdfview.js".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/JS/pdfview.js"), "application/javascript");
                return;
            }
            if ("/JS/Undo.js".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/JS/Undo.js"), "application/javascript");
                return;
            }
            if ("/css/style.css".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/css/style.css"), "text/css");
                return;
            }
            
            if ("/pdf.pdf".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/pdf.pdf"), "application/pdf");
                return;
            }
            if ("/JS/Tool.js".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/JS/Tool.js"), "application/javascript");
                return;
            }
            if ("/JS/Sidebar.js".equals(path)) {
                sendStaticFile(exchange, Paths.get("src/JS/Sidebar.js"), "application/javascript");
                return;
            }

            sendStaticFile(exchange, Paths.get("src/index.html"), "text/html");
        }
    }

    private static void sendStaticFile(HttpExchange exchange, Path path, String contentType) throws IOException {
        byte[] response = Files.readAllBytes(path);
        if (contentType != null) {
            exchange.getResponseHeaders().set("Content-Type", contentType);
        }
        exchange.sendResponseHeaders(200, response.length);
        OutputStream os = exchange.getResponseBody();
        os.write(response);
        os.close();
    }
    // NEW: HANDLER FOR JAVASCRIPT
    static class JSHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestPath = exchange.getRequestURI().getPath();
            Path jsFile;
            
            if ("/pdfview.js".equals(requestPath) || "/JS/pdfview.js".equals(requestPath)) {
                jsFile = Paths.get("src/JS/pdfview.js");
            } else if ("/Tool.js".equals(requestPath) || "/JS/Tool.js".equals(requestPath)) {
                jsFile = Paths.get("src/JS/Tool.js");
            } else if ("/Undo.js".equals(requestPath) || "/JS/Undo.js".equals(requestPath)) {
                jsFile = Paths.get("src/JS/Undo.js");
            } else if ("/Sidebar.js".equals(requestPath) || "/JS/Sidebar.js".equals(requestPath)) {
                jsFile = Paths.get("src/JS/Sidebar.js");
            } else {
                exchange.sendResponseHeaders(404, -1);
                return;
            }

            byte[] response = Files.readAllBytes(jsFile);

            // IMPORTANT: We tell the browser this is a JavaScript file
            exchange.getResponseHeaders().set("Content-Type", "application/javascript");

            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }
    // static class PDFLibHandler implements HttpHandler {
    //     public void handle(HttpExchange exchange) throws IOException {
    //         byte[] response = Files.readAllBytes(Paths.get("src/pdf.js-master/src/pdf.js"));
    //         exchange.getResponseHeaders().set("Content-Type", "application/javascript");
    //         exchange.sendResponseHeaders(200, response.length);
    //         exchange.getResponseBody().write(response);
    //         exchange.getResponseBody().close();
    //     }
    // }
    // static class FabricHandler implements HttpHandler {
    //     @Override
    //     public void handle(HttpExchange exchange) throws IOException {
    //         byte[] response = Files.readAllBytes(Paths.get("src/fabric.js-master/dist-extensions/fabric-extensions.min.js"));
    //         exchange.getResponseHeaders().set("Content-Type", "application/javascript");
    //         exchange.sendResponseHeaders(200, response.length);
    //         OutputStream os = exchange.getResponseBody();
    //         os.write(response);
    //         os.close();
    //     }
    // }
    static class PDFFileHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            // Change "src/sample.pdf" to whatever your file is actually named!
            byte[] response = Files.readAllBytes(Paths.get("src/pdf.pdf"));

            exchange.getResponseHeaders().set("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.getResponseBody().close();
        }
    }
    static class UploadHandler implements HttpHandler {
        private static final Path UPLOAD_DIR = Paths.get("src/uploads");

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            Files.createDirectories(UPLOAD_DIR);

            InputStream is = exchange.getRequestBody();
            byte[] fileBytes = is.readAllBytes();
            is.close();

            // PDF 헤더 검증 (%PDF)
            if (fileBytes.length < 4 ||
                fileBytes[0] != 0x25 || fileBytes[1] != 0x50 ||
                fileBytes[2] != 0x44 || fileBytes[3] != 0x46) {
                String error = "{\"error\": \"Invalid PDF file\"}";
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(400, error.length());
                exchange.getResponseBody().write(error.getBytes());
                exchange.getResponseBody().close();
                return;
            }

            String filename = "uploaded_" + System.currentTimeMillis() + ".pdf";
            Path savePath = UPLOAD_DIR.resolve(filename);
            Files.write(savePath, fileBytes);

            System.out.println("Received PDF: " + filename + " (" + fileBytes.length + " bytes)");

            String response = "{\"status\": \"ok\", \"filename\": \"" + filename + "\"}";
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, response.length());
            exchange.getResponseBody().write(response.getBytes());
            exchange.getResponseBody().close();
        }
    }

    static class CSSHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            byte[] response = Files.readAllBytes(Paths.get("src/css/style.css"));
            exchange.getResponseHeaders().set("Content-Type", "text/css");
            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }


}

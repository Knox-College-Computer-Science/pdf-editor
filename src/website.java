import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

public class website {
    public static void web (String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/", new website.HelloHandler());

        // 2. NEW: This tells the server how to handle the request for your JS file
        server.createContext("/pdfview.js", new website.JSHandler());

        server.createContext("/pdf.js", new PDFLibHandler());
        // If your pdfview.js is looking for "sample.pdf"
        server.createContext("/pdf.pdf", new PDFFileHandler());
        
        // NEW: Handle CSS files
        server.createContext("/css/style.css", new website.CSSHandler());

        server.setExecutor(null);

        server.start();
        System.out.println("server staterd MF!!!!");

    }
    static class HelloHandler implements HttpHandler{

        @Override
        public void handle(HttpExchange exchange) throws IOException{

            byte[] response = Files.readAllBytes(Paths.get("src/index.html"));
            //String response = "hello";

            exchange.sendResponseHeaders(200,response.length);

            OutputStream os = exchange.getResponseBody();

            os.write(response);
            os.close();
        }
    }
    // NEW: HANDLER FOR JAVASCRIPT
    static class JSHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // Make sure pdfview.js is inside your 'src' folder!
            byte[] response = Files.readAllBytes(Paths.get("src/pdfview.js"));

            // IMPORTANT: We tell the browser this is a JavaScript file
            exchange.getResponseHeaders().set("Content-Type", "application/javascript");

            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }
    static class PDFLibHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            byte[] response = Files.readAllBytes(Paths.get("src/pdf.js-master/src/pdf.js"));
            exchange.getResponseHeaders().set("Content-Type", "application/javascript");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.getResponseBody().close();
        }
    }
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

<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Pdf - turns an HTML view into a PDF with Dompdf (billing statements and official receipts).
 * The HTML comes from app/views/pdf/*.php, so the layout of the documents is the "V" of MVC.
 */
class Pdf
{
    /** Render a view (app/views/<view>.php) to HTML text. */
    public function html($view, array $data)
    {
        ob_start();
        lava_instance()->call->view($view, $data);
        return ob_get_clean();
    }

    /** @return string binary PDF */
    public function render($view, array $data)
    {
        if (!class_exists('Dompdf\\Dompdf')) {
            throw new RuntimeException('Dompdf is not installed. Run "composer install".');
        }
        $options = new Dompdf\Options();
        $options->set('isRemoteEnabled', false);       // never fetch external files while rendering
        $options->set('isPhpEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');   // has the peso sign
        $dompdf = new Dompdf\Dompdf($options);
        $dompdf->loadHtml($this->html($view, $data), 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        return $dompdf->output();
    }

    /** Send the PDF to the browser as a download. */
    public function download($binary, $filename)
    {
        $filename = preg_replace('/[^A-Za-z0-9._-]/', '_', $filename);
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($binary));
        header('X-Content-Type-Options: nosniff');
        echo $binary;
        exit;
    }
}

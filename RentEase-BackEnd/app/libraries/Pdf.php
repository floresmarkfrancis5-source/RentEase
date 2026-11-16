<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Pdf
{
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
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');
        $dompdf = new Dompdf\Dompdf($options);
        $dompdf->loadHtml($this->html($view, $data), 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        return $dompdf->output();
    }

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
